package com.replyboss.review;

import com.replyboss.ai.EmbeddingClient;
import com.replyboss.ai.SimilarityProperties;
import com.replyboss.ai.Vectors;
import com.replyboss.reply.Reply;
import com.replyboss.reply.ReplyGenerationService.PastReply;
import com.replyboss.reply.ReplyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * 중복 답글 방지 3단 중 1·2단의 준비 작업.
 *  1단(입력 시): 새 리뷰를 최근 리뷰와 임베딩으로 비교해 비슷한 리뷰끼리 같은 묶음(groupId)에 넣는다.
 *  2단(생성 시): 같은 묶음 리뷰에 단 최종 답글 + 최근 최종 답글을 모아 생성 프롬프트와 3단 비교에 넘긴다.
 * 임베딩 호출이 실패해도 리뷰 등록·답글 생성은 그대로 진행한다 (묶기·비교만 건너뜀).
 */
@Service
public class DuplicateGuard {

    private static final Logger log = LoggerFactory.getLogger(DuplicateGuard.class);

    private final EmbeddingClient embeddingClient;
    private final SimilarityProperties props;
    private final ReviewRepository reviewRepository;
    private final ReplyRepository replyRepository;

    public DuplicateGuard(EmbeddingClient embeddingClient, SimilarityProperties props,
                          ReviewRepository reviewRepository, ReplyRepository replyRepository) {
        this.embeddingClient = embeddingClient;
        this.props = props;
        this.reviewRepository = reviewRepository;
        this.replyRepository = replyRepository;
    }

    /** 1단: 새로 등록한 리뷰(본문 있는 것)를 묶는다. 실패하면 아무것도 하지 않는다. */
    public void groupReviews(Long storeId, List<Review> fresh) {
        List<Review> targets = fresh.stream().filter(Review::hasContent).toList();
        if (targets.isEmpty()) {
            return;
        }
        List<float[]> vectors = tryEmbed(targets.stream().map(Review::getMaskedContent).toList());
        if (vectors == null) {
            return;
        }
        List<Long> freshIds = targets.stream().map(Review::getId).toList();
        List<Review> pool = new ArrayList<>(reviewRepository.findByStore_IdAndCreatedAtAfterAndEmbeddingIsNotNull(
                        storeId, LocalDateTime.now().minusDays(props.reviewGroupDays())).stream()
                .filter(r -> !freshIds.contains(r.getId()))
                .toList());
        List<float[]> poolVectors = new ArrayList<>(pool.stream().map(r -> Vectors.fromText(r.getEmbedding())).toList());

        for (int i = 0; i < targets.size(); i++) {
            Review review = targets.get(i);
            float[] v = vectors.get(i);
            review.recordEmbedding(Vectors.toText(v));
            int best = -1;
            double bestScore = 0;
            for (int j = 0; j < pool.size(); j++) {
                double score = Vectors.cosine(v, poolVectors.get(j));
                if (score >= props.reviewGroupThreshold() && score > bestScore) {
                    best = j;
                    bestScore = score;
                }
            }
            if (best >= 0) {
                Review match = pool.get(best);
                if (match.getGroupId() == null) {
                    match.joinGroup(UUID.randomUUID().toString());
                    reviewRepository.save(match);
                }
                review.joinGroup(match.getGroupId());
            }
            reviewRepository.save(review);
            pool.add(review);
            poolVectors.add(v);
        }
    }

    /**
     * 2단: 새 초안이 피해야 할 이전 답글. 같은 묶음 리뷰의 최종 답글을 먼저, 그다음 최근 최종 답글.
     * 임베딩이 없는 답글은 한 번에 계산해 저장해 둔다 (실패하면 문장만 넘김).
     */
    public List<PastReply> pastReplies(Review review) {
        Map<Long, Reply> picked = new LinkedHashMap<>();
        if (review.getGroupId() != null) {
            List<Long> siblingFinals = reviewRepository.findByStore_IdAndGroupIdAndIdNot(
                            review.getStore().getId(), review.getGroupId(), review.getId()).stream()
                    .map(Review::getFinalReplyId).filter(Objects::nonNull).toList();
            replyRepository.findAllById(siblingFinals).forEach(r -> picked.put(r.getId(), r));
        }
        replyRepository.findRecentFinals(review.getStore().getId(), review.getId(),
                        PageRequest.of(0, Math.max(1, props.compareCount())))
                .forEach(r -> picked.putIfAbsent(r.getId(), r));

        List<Reply> replies = new ArrayList<>(picked.values());
        List<Reply> missing = replies.stream().filter(r -> r.getEmbedding() == null).toList();
        if (!missing.isEmpty()) {
            List<float[]> vectors = tryEmbed(missing.stream().map(Reply::getText).toList());
            if (vectors != null) {
                for (int i = 0; i < missing.size(); i++) {
                    missing.get(i).recordEmbedding(Vectors.toText(vectors.get(i)));
                }
                replyRepository.saveAll(missing);
            }
        }
        return replies.stream().map(r -> new PastReply(r.getText(), Vectors.fromText(r.getEmbedding()))).toList();
    }

    /** 최종 답글 문장이 바뀌었으면 임베딩을 다시 계산한다 (실패하면 다음 비교 때 계산) */
    public void refreshEmbedding(Reply reply) {
        if (reply.getEmbedding() != null) {
            return;
        }
        List<float[]> vectors = tryEmbed(List.of(reply.getText()));
        if (vectors != null) {
            reply.recordEmbedding(Vectors.toText(vectors.get(0)));
        }
    }

    /** 실패하거나 개수가 맞지 않으면 null */
    private List<float[]> tryEmbed(List<String> texts) {
        try {
            List<float[]> vectors = embeddingClient.embed(texts);
            if (vectors == null || vectors.size() != texts.size() || vectors.contains(null)) {
                return null;
            }
            return vectors;
        } catch (RuntimeException e) {
            log.warn("임베딩을 받지 못해 비슷한 리뷰·답글 비교를 건너뜁니다: {}", e.getMessage());
            return null;
        }
    }
}
