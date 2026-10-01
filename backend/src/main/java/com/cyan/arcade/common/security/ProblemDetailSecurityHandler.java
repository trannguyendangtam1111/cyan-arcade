package com.cyan.arcade.common.security;

import java.io.IOException;
import java.net.URI;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.error.Problems;

/**
 * Writes 401/403 responses from the security filter chain in the same problem-detail format as
 * the rest of the API, so the frontend only ever has to parse one error shape.
 */
@Component
class ProblemDetailSecurityHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

	private final JsonMapper jsonMapper;

	ProblemDetailSecurityHandler(JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException authException) throws IOException {
		write(request, response, HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED, "Authentication is required");
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
			AccessDeniedException accessDeniedException) throws IOException {
		write(request, response, HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN,
				"You do not have permission to perform this action");
	}

	private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String code,
			String detail) throws IOException {
		ProblemDetail problem = Problems.of(status, code, detail);
		problem.setInstance(URI.create(request.getRequestURI()));
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		this.jsonMapper.writeValue(response.getOutputStream(), problem);
	}

}
