package com.cyan.arcade.auth;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.security.AuthenticatedUser;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

/** Registration and sign-in. The only place that handles a password. */
@Service
class AuthService {

	static final String INVALID_CREDENTIALS = "INVALID_CREDENTIALS";

	private final UserService users;

	private final PasswordEncoder passwordEncoder;

	private final AuthenticationManager authenticationManager;

	private final SecurityContextRepository securityContextRepository;

	private final SessionAuthenticationStrategy sessionStrategy;

	private final LoginAttemptLimiter attempts;

	AuthService(UserService users, PasswordEncoder passwordEncoder, AuthenticationManager authenticationManager,
			SecurityContextRepository securityContextRepository, SessionAuthenticationStrategy sessionStrategy,
			LoginAttemptLimiter attempts) {
		this.attempts = attempts;
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.authenticationManager = authenticationManager;
		this.securityContextRepository = securityContextRepository;
		this.sessionStrategy = sessionStrategy;
	}

	/** Creates the account and signs the new player in straight away. */
	UserAccount register(RegisterRequest registration, HttpServletRequest request, HttpServletResponse response) {
		UserAccount account = this.users.create(registration.username(), this.passwordEncoder.encode(registration.password()));
		signIn(new AuthenticatedUser(account.id(), account.username(), account.role()), request, response);
		return account;
	}

	UserAccount login(LoginRequest login, HttpServletRequest request, HttpServletResponse response) {
		// Refused before the password is looked at, so a blocked guesser learns nothing and costs nothing.
		String address = request.getRemoteAddr();
		this.attempts.check(login.username(), address);

		LoginUser verified;
		try {
			Authentication result = this.authenticationManager
				.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(login.username(), login.password()));
			verified = (LoginUser) result.getPrincipal();
		}
		catch (AuthenticationException ex) {
			// One message for "no such user" and "wrong password", so the API does not reveal which
			// usernames exist.
			this.attempts.recordFailure(login.username(), address);
			throw new ApiException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS, "Wrong username or password");
		}
		this.attempts.recordSuccess(login.username(), address);
		signIn(new AuthenticatedUser(verified.getId(), verified.getUsername(), verified.getRole()), request, response);
		return this.users.get(verified.getId());
	}

	/**
	 * Starts a session for the player: from now on, requests with the session cookie are theirs, with
	 * the authority of their role ({@code ROLE_USER} or {@code ROLE_ADMIN}). A role is read at sign-in.
	 */
	private void signIn(AuthenticatedUser user, HttpServletRequest request, HttpServletResponse response) {
		Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(user, null,
				user.role().authorities());
		// Fresh session id and fresh CSRF token at the moment of signing in.
		this.sessionStrategy.onAuthentication(authentication, request, response);

		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		this.securityContextRepository.saveContext(context, request, response);
	}

}
