package com.replyboss;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ReplyBossApplication {

    public static void main(String[] args) {
        SpringApplication.run(ReplyBossApplication.class, args);
    }
}
