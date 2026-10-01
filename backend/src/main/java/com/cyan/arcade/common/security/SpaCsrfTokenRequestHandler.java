package com.cyan.arcade.common.security;

import java.util.function.Supplier;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

/**
 * CSRF token handling for a single-page app, following the Spring Security reference.
 *
 * <p>The token is handed to the browser in a readable {@code XSRF-TOKEN} cookie, and the app sends
 * it back in the {@code X-XSRF-TOKEN} header on every request that changes something. Another site
 * cannot read that cookie, so it cannot forge the header.
 */
final class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

	private final CsrfTokenRequestHandler plain = new CsrfTokenRequestAttributeHandler();

	private final CsrfTokenRequestHandler xor = new XorCsrfTokenRequestAttributeHandler();

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
		// Masks the token wherever it is rendered into a response body (BREACH protection).
		this.xor.handle(request, response, csrfToken);
		// Tokens are created lazily; reading it here makes sure the cookie is sent on every response,
		// so the app has a token before its first POST.
		csrfToken.get();
	}

	@Override
	public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
		// The app sends the raw cookie value in a header; anything else would be a masked token.
		String header = request.getHeader(csrfToken.getHeaderName());
		return (StringUtils.hasText(header) ? this.plain : this.xor).resolveCsrfTokenValue(request, csrfToken);
	}

}
