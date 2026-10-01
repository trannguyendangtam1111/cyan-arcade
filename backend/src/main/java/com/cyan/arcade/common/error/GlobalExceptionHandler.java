package com.cyan.arcade.common.error;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Converts every exception raised by a controller into the platform's problem-detail format
 * (see {@link Problems}). Controllers should simply throw; they never build error responses by hand.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	ProblemDetail handleApiException(ApiException ex) {
		return Problems.of(ex.getStatus(), ex.getCode(), ex.getMessage());
	}

	/** Let Spring Security's own handlers produce 401/403 when these escape a method-security check. */
	@ExceptionHandler({ AuthenticationException.class, AccessDeniedException.class })
	void rethrowSecurityException(RuntimeException ex) {
		throw ex;
	}

	@ExceptionHandler(Exception.class)
	ProblemDetail handleUnexpected(Exception ex) {
		log.error("Unhandled exception", ex);
		return Problems.of(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCodes.INTERNAL_ERROR,
				"Something went wrong on our side. Please try again.");
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<Problems.FieldError> errors = ex.getBindingResult()
			.getFieldErrors()
			.stream()
			.map((error) -> new Problems.FieldError(error.getField(), error.getDefaultMessage()))
			.toList();
		return validationProblem(ex, errors, headers, status, request);
	}

	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<Problems.FieldError> errors = ex.getParameterValidationResults()
			.stream()
			.flatMap((result) -> result.getResolvableErrors()
				.stream()
				.map((error) -> new Problems.FieldError(result.getMethodParameter().getParameterName(),
						error.getDefaultMessage())))
			.toList();
		return validationProblem(ex, errors, headers, status, request);
	}

	/** Every problem produced by the base class (404, 405, unreadable body, ...) gets the platform extensions. */
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
			HttpStatusCode statusCode, WebRequest request) {
		ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
		if (response != null && response.getBody() instanceof ProblemDetail problem) {
			Problems.decorate(problem, null);
		}
		return response;
	}

	private ResponseEntity<Object> validationProblem(Exception ex, List<Problems.FieldError> errors,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		ProblemDetail problem = Problems.of(status, ErrorCodes.VALIDATION_FAILED, "Request validation failed");
		Problems.withFieldErrors(problem, errors);
		return handleExceptionInternal(ex, problem, headers, status, request);
	}

}
