package com.cyan.arcade.common.error;

import org.springframework.http.HttpStatus;

/**
 * Base class for expected, client-facing errors. The {@link GlobalExceptionHandler} turns these into
 * RFC 9457 problem responses carrying the given status and machine-readable {@code code}.
 */
public class ApiException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus getStatus() {
		return this.status;
	}

	public String getCode() {
		return this.code;
	}

}
