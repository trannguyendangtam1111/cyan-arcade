package com.cyan.arcade.user;

import java.time.Clock;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Player accounts: creating them, reading them, and the few things about them that can change. */
@Service
@Transactional(readOnly = true)
public class UserService {

	public static final String USERNAME_TAKEN = "USERNAME_TAKEN";

	private final UserRepository users;

	private final Clock clock;

	UserService(UserRepository users, Clock clock) {
		this.users = users;
		this.clock = clock;
	}

	/**
	 * Creates an account.
	 * @param passwordHash the already hashed password; this service never sees the password itself
	 */
	@Transactional
	public UserAccount create(String username, String passwordHash) {
		if (this.users.existsByUsernameIgnoreCase(username)) {
			throw usernameTaken(username);
		}
		try {
			return UserAccount.from(this.users.saveAndFlush(new User(username, passwordHash, this.clock.instant())));
		}
		catch (DataIntegrityViolationException ex) {
			// Two registrations for the same name at the same moment: the unique index decides.
			throw usernameTaken(username);
		}
	}

	public UserAccount get(Long id) {
		return this.users.findById(id).map(UserAccount::from).orElseThrow(() -> new NotFoundException("User", id));
	}

	/** Looks up several players at once, keyed by id. Unknown ids are simply absent. */
	public Map<Long, UserAccount> getAll(Collection<Long> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return this.users.findByIdIn(ids)
			.stream()
			.map(UserAccount::from)
			.collect(Collectors.toMap(UserAccount::id, Function.identity()));
	}

	/** For authentication only: the stored hash for a username, matched regardless of case. */
	public Optional<UserCredentials> findCredentials(String username) {
		return this.users.findByUsernameIgnoreCase(username)
			.map((user) -> new UserCredentials(user.getId(), user.getUsername(), user.getPasswordHash()));
	}

	@Transactional
	public UserAccount changeAvatar(Long id, Avatar avatar) {
		User user = this.users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
		user.setAvatar(avatar);
		return UserAccount.from(user);
	}

	/**
	 * Adds experience points.
	 * @return the player's total XP afterwards
	 */
	@Transactional
	public int addXp(Long id, int amount) {
		if (amount < 0) {
			throw new IllegalArgumentException("XP can only be added");
		}
		if (this.users.addXp(id, amount) == 0) {
			throw new NotFoundException("User", id);
		}
		return get(id).xp();
	}

	private static ConflictException usernameTaken(String username) {
		return new ConflictException(USERNAME_TAKEN, "The username '%s' is already taken".formatted(username));
	}

}
