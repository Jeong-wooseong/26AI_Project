package com.replyboss.reply;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 평점만 리뷰용 템플릿. 별점 구간과 존댓말 수준별로 여러 개를 두고 돌아가며 쓴다.
 * 본문이 없는 리뷰이므로 맛·배달 같은 구체적인 내용은 넣지 않는다.
 */
@Entity
@Table(name = "template")
public class ReplyTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "rating_min", nullable = false)
    private int ratingMin;

    @Column(name = "rating_max", nullable = false)
    private int ratingMax;

    /** 하십시오체 / 해요체 */
    @Column(nullable = false, length = 20)
    private String formality;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    protected ReplyTemplate() {
    }

    public ReplyTemplate(int ratingMin, int ratingMax, String formality, String content) {
        this.ratingMin = ratingMin;
        this.ratingMax = ratingMax;
        this.formality = formality;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public int getRatingMin() {
        return ratingMin;
    }

    public int getRatingMax() {
        return ratingMax;
    }

    public String getFormality() {
        return formality;
    }

    public String getContent() {
        return content;
    }
}
