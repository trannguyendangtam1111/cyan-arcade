package com.cyan.arcade.common.deployment;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

/** Fail before ordinary singleton initialization; never include supplied values in an error. */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
class ProductionDeploymentConfig {

	@Bean
	static BeanFactoryPostProcessor productionSafetyChecks(Environment environment) {
		return (factory) -> validate(environment);
	}

	static void validate(Environment environment) {
		String url = environment.getProperty("spring.datasource.url", "");
		if (!requiresTls(url)) {
			throw new IllegalStateException("Production DB_URL must be a PostgreSQL JDBC URL with one sslmode=require, verify-ca or verify-full parameter");
		}
		String origins = environment.getProperty("app.cors.allowed-origins", "");
		if (origins.isBlank() || !Arrays.stream(origins.split(",", -1)).allMatch(ProductionDeploymentConfig::httpsOrigin)) {
			throw new IllegalStateException("Production CORS_ALLOWED_ORIGINS must list exact HTTPS frontend origins");
		}
		if (Arrays.asList(environment.getActiveProfiles()).contains("import-tcg")
				|| !environment.getProperty("app.tcg.import.sources", "").isBlank()
				|| !environment.getProperty("app.tcg.import.files", "").isBlank()
				|| environment.getProperty("app.tcg.import.exit-when-done", Boolean.class, false)) {
			throw new IllegalStateException("Startup card imports and import-tcg are disabled in production");
		}
	}

	private static boolean requiresTls(String value) {
		try {
			if (!value.startsWith("jdbc:postgresql://")) {
				return false;
			}
			URI url = URI.create(value.substring("jdbc:".length()));
			if (url.getHost() == null || url.getUserInfo() != null || url.getRawQuery() == null) {
				return false;
			}
			String mode = null;
			for (String pair : url.getRawQuery().split("&")) {
				String[] entry = pair.split("=", 2);
				String key = URLDecoder.decode(entry[0], StandardCharsets.UTF_8);
				if (key.equals("user") || key.equals("password")) {
					return false;
				}
				if (key.equals("sslmode")) {
					if (mode != null || entry.length != 2) {
						return false;
					}
					mode = URLDecoder.decode(entry[1], StandardCharsets.UTF_8);
				}
			}
			return mode != null && Set.of("require", "verify-ca", "verify-full").contains(mode);
		}
		catch (IllegalArgumentException ex) {
			return false;
		}
	}

	private static boolean httpsOrigin(String value) {
		try {
			URI uri = URI.create(value.trim());
			return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
					&& (uri.getPath() == null || uri.getPath().isEmpty()) && uri.getQuery() == null && uri.getFragment() == null;
		}
		catch (IllegalArgumentException ex) {
			return false;
		}
	}

}
