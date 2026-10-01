package com.cyan.arcade;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Makes every MockMvc request carry a valid CSRF token, as the real app does on every request that
 * changes something. Tests about CSRF itself override it with an invalid token.
 */
@TestConfiguration(proxyBeanMethods = false)
public class MockMvcTestConfiguration {

	@Bean
	MockMvcBuilderCustomizer validCsrfTokenByDefault() {
		return (builder) -> builder.defaultRequest(get("/").with(csrf()));
	}

}
