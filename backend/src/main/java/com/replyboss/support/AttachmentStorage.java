package com.replyboss.support;

import com.replyboss.common.ApiException;
import com.replyboss.common.AppProperties;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.UUID;

/**
 * 문의 첨부 이미지 저장 (서버 폴더, 기본 backend/data/uploads).
 * 확장자나 브라우저가 보낸 형식을 믿지 않고 파일 앞부분(시그니처)으로 PNG·JPEG·GIF·WEBP 인지 확인한다.
 * 파일 이름은 무작위로 바꿔 저장하고, 원래 이름은 표시용으로만 쓴다.
 */
@Component
public class AttachmentStorage {

    public static final long MAX_SIZE = 5L * 1024 * 1024;

    public record Stored(String originalName, String path, String contentType, long size) {
    }

    private final Path root;

    public AttachmentStorage(AppProperties props) {
        String dir = props.uploadDir() == null || props.uploadDir().isBlank() ? "./data/uploads" : props.uploadDir();
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    public Stored save(MultipartFile file) {
        if (file.getSize() > MAX_SIZE) {
            throw ApiException.badRequest("FILE_TOO_LARGE", "첨부 이미지는 5MB 이하만 올릴 수 있습니다.");
        }
        byte[] head = new byte[12];
        int read;
        try (InputStream in = file.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        String[] type = detect(Arrays.copyOf(head, read));
        if (type == null) {
            throw ApiException.badRequest("INVALID_FILE", "PNG, JPG, GIF, WEBP 이미지 파일만 첨부할 수 있습니다.");
        }
        String name = UUID.randomUUID() + "." + type[1];
        Path target = root.resolve("inquiries").resolve(name).normalize();
        try {
            Files.createDirectories(target.getParent());
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("첨부 파일 저장 실패", e);
        }
        String original = file.getOriginalFilename() == null ? name : Path.of(file.getOriginalFilename()).getFileName().toString();
        if (original.length() > 200) {
            original = original.substring(original.length() - 200);
        }
        return new Stored(original, "inquiries/" + name, type[0], file.getSize());
    }

    public Resource load(String path) {
        Path file = resolve(path);
        if (!Files.isRegularFile(file)) {
            throw ApiException.notFound("첨부 파일");
        }
        return new FileSystemResource(file);
    }

    public void delete(String path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(resolve(path));
        } catch (IOException e) {
            // 지우지 못한 파일은 남겨 둔다 (데이터베이스 기록은 이미 지워짐)
        }
    }

    private Path resolve(String path) {
        Path file = root.resolve(path).normalize();
        if (!file.startsWith(root)) {
            throw ApiException.notFound("첨부 파일");
        }
        return file;
    }

    /** [content-type, 확장자] 또는 null */
    static String[] detect(byte[] h) {
        if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') {
            return new String[]{"image/png", "png"};
        }
        if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) {
            return new String[]{"image/jpeg", "jpg"};
        }
        if (h.length >= 4 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') {
            return new String[]{"image/gif", "gif"};
        }
        if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') {
            return new String[]{"image/webp", "webp"};
        }
        return null;
    }
}
