package com.cyan.arcade.common.security;

import java.util.List;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security for the API.
 *
 * <ul>
 * <li><b>Sessions.</b> Signing in creates a server-side session, referenced by an HttpOnly cookie
 * that page scripts cannot read. Nothing secret is ever stored in the browser.</li>
 * <li><b>CSRF.</b> Every request that changes something must carry the CSRF token, see
 * {@link SpaCsrfTokenRequestHandler}. That includes the requests guests may make.</li>
 * <li><b>Deny by default.</b> Public endpoints are listed here; everything else needs a signed-in
 * player.</li>
 * <li><b>Roles.</b> Every account is a {@link Role#USER} or an {@link Role#ADMIN}. Admin-only
 * endpoints ({@code /api/admin/**}, and {@code /api/ai/**} for AI mode) need {@code ROLE_ADMIN}
 * here, and their controllers say so again with {@code @PreAuthorize}, so neither a gap in this
 * list nor a new handler can open them up. A player gets {@code 403}, a guest {@code 401}.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CorsProperties.class)
@EnableMethodSecurity
class SecurityConfig {

	static final String LOGOUT_URL = "/api/auth/logout";

	@Bean
	SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, ProblemDetailSecurityHandler problemHandler,
			SecurityContextRepository securityContextRepository, CsrfTokenRepository csrfTokenRepository) {
		http.cors(Customizer.withDefaults())
			.csrf((csrf) -> csrf.csrfTokenRepository(csrfTokenRepository)
				.csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
			.securityContext((context) -> context.securityContextRepository(securityContextRepository))
			// Signing in is done by the auth feature's own JSON endpoints, not by browser forms or Basic auth.
			.httpBasic(AbstractHttpConfigurer::disable)
			.formLogin(AbstractHttpConfigurer::disable)
			.logout((logout) -> logout.logoutUrl(LOGOUT_URL)
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
				.permitAll())
			.exceptionHandling((ex) -> ex.authenticationEntryPoint(problemHandler).accessDeniedHandler(problemHandler))
			.authorizeHttpRequests((auth) -> auth.requestMatchers(EndpointRequest.to("health", "info"))
				.permitAll()
				.requestMatchers("/error")
				.permitAll()
				// Public, read-only platform endpoints.
				// Today's daily challenges are public; "/api/daily-challenges/me" is not listed and needs a session.
				// So is what the shop sells; buying, coins, inventories and the daily login reward are not.
				// Players' public profiles too; everything under /api/users/me is not.
				.requestMatchers(HttpMethod.GET, "/api/games", "/api/games/**", "/api/leaderboards/**",
						"/api/daily-challenges", "/api/shop/items", "/api/users/*/profile", "/api/auth/session")
				.permitAll()
				// The card catalog can be browsed by anyone. Opening packs, collections and opening
				// histories are not listed and need a session.
				.requestMatchers(HttpMethod.GET, "/api/tcg/games", "/api/tcg/games/*", "/api/tcg/sets",
						"/api/tcg/sets/*", "/api/tcg/packs", "/api/tcg/packs/*", "/api/tcg/cards")
				.permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login")
				.permitAll()
				// Guests may play and submit scores; a run started while signed in belongs to that player.
				.requestMatchers(HttpMethod.POST, "/api/game-sessions", "/api/game-sessions/*/finish")
				.permitAll()
				// Word Guess is played on the server, by guests too; its AI is under /api/ai below.
				.requestMatchers(HttpMethod.GET, "/api/wordle/daily", "/api/wordle/stats")
				.permitAll()
				.requestMatchers(HttpMethod.POST, "/api/wordle/daily/runs", "/api/wordle/practice/runs",
						"/api/wordle/runs/*/guesses", "/api/wordle/runs/*/hints")
				.permitAll()
				// So is Sudoku, which keeps the solution on the server; its AI is under /api/ai below.
				.requestMatchers(HttpMethod.GET, "/api/sudoku/today", "/api/sudoku/stats")
				.permitAll()
				.requestMatchers(HttpMethod.POST, "/api/sudoku/daily/runs", "/api/sudoku/practice/runs",
						"/api/sudoku/runs/*/session", "/api/sudoku/runs/*/moves", "/api/sudoku/runs/*/hints",
						"/api/sudoku/runs/*/pause", "/api/sudoku/runs/*/resume")
				.permitAll()
				// Administration and the games' AI mode: admins only.
				.requestMatchers("/api/admin/**", "/api/ai/**")
				.hasRole(Role.ADMIN.name())
				.anyRequest()
				.authenticated());
		return http.build();
	}

	/** Where the signed-in player is remembered between requests: the HTTP session. */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/** The CSRF token lives in a cookie the app can read (it is not a secret from the page itself). */
	@Bean
	CsrfTokenRepository csrfTokenRepository() {
		return CookieCsrfTokenRepository.withHttpOnlyFalse();
	}

	/**
	 * What must happen at the moment someone signs in: a fresh session id, so an id planted before
	 * login is worthless (session fixation), and a fresh CSRF token.
	 */
	@Bean
	SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrfTokenRepository) {
		CsrfAuthenticationStrategy renewCsrfToken = new CsrfAuthenticationStrategy(csrfTokenRepository);
		renewCsrfToken.setRequestHandler(new SpaCsrfTokenRequestHandler());
		return new CompositeSessionAuthenticationStrategy(
				List.of(new ChangeSessionIdAuthenticationStrategy(), renewCsrfToken));
	}

	/**
	 * Lets a frontend served from another origin (e.g. the Vite dev server calling the API directly)
	 * use the API. Not needed when the frontend proxies {@code /api}, which is the default setup.
	 */
	@Bean
	CorsConfigurationSource corsConfigurationSource(CorsProperties properties) {
		CorsConfiguration configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(properties.allowedOrigins());
		configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		configuration.setAllowedHeaders(List.of(HttpHeaders.ACCEPT, HttpHeaders.CONTENT_TYPE, GuestPlayer.HEADER,
				"X-XSRF-TOKEN"));
		// The session cookie must travel with requests from the allowed origins.
		configuration.setAllowCredentials(true);
		configuration.setMaxAge(3600L);

		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}

}
