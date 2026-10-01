package com.cyan.arcade.common.error;

/** Machine-readable error codes shared across the API. Modules may define their own codes too. */
public final class ErrorCodes {

	public static final String VALIDATION_FAILED = "VALIDATION_FAILED";

	public static final String BAD_REQUEST = "BAD_REQUEST";

	public static final String UNAUTHORIZED = "UNAUTHORIZED";

	public static final String FORBIDDEN = "FORBIDDEN";

	public static final String NOT_FOUND = "NOT_FOUND";

	public static final String METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED";

	public static final String CONFLICT = "CONFLICT";

	public static final String INTERNAL_ERROR = "INTERNAL_ERROR";

	private ErrorCodes() {
	}

	/** Default code for a status when the exception does not provide a more specific one. */
	public static String forStatus(int status) {
		return switch (status) {
			case 400 -> BAD_REQUEST;
			case 401 -> UNAUTHORIZED;
			case 403 -> FORBIDDEN;
			case 404 -> NOT_FOUND;
			case 405 -> METHOD_NOT_ALLOWED;
			case 409 -> CONFLICT;
			default -> (status >= 500) ? INTERNAL_ERROR : BAD_REQUEST;
		};
	}

}
