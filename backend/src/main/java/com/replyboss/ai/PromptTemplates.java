package com.replyboss.ai;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * resources/prompts/*.txt 를 읽어 {{변수}} 를 채운다.
 * 프롬프트를 코드와 분리해 버전(v1, v2 …)을 파일 단위로 관리하기 위함.
 */
@Component
public class PromptTemplates {

    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public String render(String name, Map<String, String> vars) {
        String text = cache.computeIfAbsent(name, this::load);
        for (Map.Entry<String, String> e : vars.entrySet()) {
            text = text.replace("{{" + e.getKey() + "}}", e.getValue() == null ? "" : e.getValue());
        }
        return text;
    }

    private String load(String name) {
        ClassPathResource resource = new ClassPathResource("prompts/" + name + ".txt");
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("프롬프트 파일을 읽을 수 없습니다: " + name, e);
        }
    }
}
