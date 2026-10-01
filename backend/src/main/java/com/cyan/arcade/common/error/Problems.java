package com.cyan.arcade.common.error;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

/**
 * Builds the single error shape used by the whole API: RFC 9457 problem details plus a few
 * extension members.
 *
 * <pre>{@code
 * { "type": "about:blank", "title": "Bad Request", "status": 400, "detail": "...",
 *   "instance": "/api/...", "code": "VALIDATION_FAILED", "timestamp": "...",
 *   "errors": [ { "field": "score", "message": "must be greater than or equal to 0" } ] }
 * }</pre>
 */
public final class Problems {

	public static final String CODE = "code";

	public static final String TIMESTAMP = "timestamp";

	public static final String ERRORS = "errors";

	private Problems() {
	}

	public static ProblemDetail of(HttpStatusCode status, String code, String detail) {
		return decorate(ProblemDetail.forStatusAndDetail(status, detail), code);
	}

	/** Adds the platform extensions to a problem that Spring (or we) already created. */
	public static ProblemDetail decorate(ProblemDetail problem, String code) {
		Map<String, Object> properties = problem.getProperties();
		if (properties == null || !properties.containsKey(CODE)) {
			problem.setProperty(CODE, (code != null) ? code : ErrorCodes.forStatus(problem.getStatus()));
		}
		if (properties == null || !properties.containsKey(TIMESTAMP)) {
			problem.setProperty(TIMESTAMP, Instant.now());
		}
		return problem;
	}

	public static ProblemDetail withFieldErrors(ProblemDetail problem, List<FieldError> errors) {
		problem.setProperty(ERRORS, errors);
		return problem;
	}

	public record FieldError(String field, String message) {
	}

}
