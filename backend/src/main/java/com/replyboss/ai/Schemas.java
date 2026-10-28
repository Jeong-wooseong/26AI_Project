package com.replyboss.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 구조화 출력용 JSON Schema 를 짧게 쓰기 위한 도우미.
 * Claude 구조화 출력은 object 에 additionalProperties=false 가 필요하고,
 * minimum/maxLength 같은 수치·길이 제약은 지원하지 않으므로 그런 검사는 코드에서 한다.
 */
public final class Schemas {

    private Schemas() {
    }

    /** 모든 속성을 required 로 두는 object. properties 는 넣은 순서를 유지한다. */
    public static Map<String, Object> object(Map<String, Object> properties) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", new ArrayList<>(properties.keySet()));
        schema.put("additionalProperties", false);
        return schema;
    }

    public static Map<String, Object> string() {
        return Map.of("type", "string");
    }

    public static Map<String, Object> stringEnum(List<String> values) {
        return Map.of("type", "string", "enum", values);
    }

    public static Map<String, Object> number() {
        return Map.of("type", "number");
    }

    public static Map<String, Object> arrayOf(Map<String, Object> items) {
        return Map.of("type", "array", "items", items);
    }

    /** 순서를 유지하는 properties 맵을 만든다: props("a", schemaA, "b", schemaB, ...) */
    public static Map<String, Object> props(Object... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("키와 값이 짝이 맞지 않습니다");
        }
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }
}
