package com.replyboss.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 임베딩 벡터 계산과 저장 형식 (DB 에는 "[0.1,0.2,...]" 문자열로 저장) */
public final class Vectors {

    private Vectors() {
    }

    /** 코사인 유사도. 길이가 다르거나 0 벡터면 0 */
    public static double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length || a.length == 0) {
            return 0;
        }
        double dot = 0;
        double na = 0;
        double nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return na == 0 || nb == 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    /** candidates 중 가장 높은 유사도 (없으면 0) */
    public static double maxCosine(float[] v, List<float[]> candidates) {
        double max = 0;
        for (float[] c : candidates) {
            max = Math.max(max, cosine(v, c));
        }
        return max;
    }

    public static String toText(float[] v) {
        if (v == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder(v.length * 10).append('[');
        for (int i = 0; i < v.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(String.format(Locale.ROOT, "%.6f", v[i]));
        }
        return sb.append(']').toString();
    }

    public static float[] fromText(String text) {
        if (text == null || text.length() < 2) {
            return null;
        }
        String body = text.strip();
        body = body.substring(1, body.length() - 1);
        if (body.isBlank()) {
            return null;
        }
        String[] parts = body.split(",");
        float[] v = new float[parts.length];
        try {
            for (int i = 0; i < parts.length; i++) {
                v[i] = Float.parseFloat(parts[i].strip());
            }
        } catch (NumberFormatException e) {
            return null;
        }
        return v;
    }

    public static List<float[]> nonNull(List<float[]> list) {
        List<float[]> out = new ArrayList<>();
        for (float[] v : list) {
            if (v != null) {
                out.add(v);
            }
        }
        return out;
    }
}
