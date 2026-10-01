package com.cyan.arcade.common.security;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Origins allowed to call the API from a browser.
 *
 * @param allowedOrigins exact origins such as {@code http://localhost:5173}; empty disables CORS
 */
@ConfigurationProperties("app.cors")
record CorsProperties(List<String> allowedOrigins) {

	CorsProperties {
		allowedOrigins = (allowedOrigins != null) ? List.copyOf(allowedOrigins) : List.of();
	}

}
