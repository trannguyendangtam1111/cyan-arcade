package com.cyan.arcade.user;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.common.security.Role;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Limit;
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
	 * Creates a player's account, with the {@link Role#USER} role: the only kind anyone can sign up for.
	 * @param passwordHash the already hashed password; this service never sees the password itself
	 */
	@Transactional
	public UserAccount create(String username, String passwordHash) {
		return create(username, passwordHash, Role.USER);
	}

	/**
	 * Creates an account with a given role. Only the application itself asks for anything but a
	 * player (the admin account seeded at startup); no endpoint takes a role.
	 * @param passwordHash the already hashed password; this service never sees the password itself
	 */
	@Transactional
	public UserAccount create(String username, String passwordHash, Role role) {
		if (this.users.existsByUsernameIgnoreCase(username)) {
			throw usernameTaken(username);
		}
		try {
			return UserAccount
				.from(this.users.saveAndFlush(new User(username, passwordHash, role, this.clock.instant())));
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
			.map((user) -> new UserCredentials(user.getId(), user.getUsername(), user.getPasswordHash(), user.getRole()));
	}

	/** Every account, players and admins. */
	public long count() {
		return this.users.count();
	}

	public long countCreatedSince(Instant since) {
		return this.users.countByCreatedAtGreaterThanEqual(since);
	}

	/** Accounts whose username contains a text, regardless of case, in alphabetical order. */
	public List<UserAccount> search(String text, int limit) {
		String pattern = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
		return this.users.findByUsernameLike(pattern, Limit.of(limit)).stream().map(UserAccount::from).toList();
	}

	/** An account by its username, matched regardless of case. */
	public Optional<UserAccount> findByUsername(String username) {
		return this.users.findByUsernameIgnoreCase(username).map(UserAccount::from);
	}

	/**
	 * Changes what a player shows of themselves. Only these three can be changed: the username,
	 * role, XP and everything earned stay as they are. Values must already be validated.
	 * @param displayName the new display name, or {@code null} to keep it
	 * @param bio the new bio ({@code ""} to remove it), or {@code null} to keep it
	 * @param avatar the new avatar, or {@code null} to keep it
	 */
	@Transactional
	public UserAccount changeProfile(Long id, String displayName, String bio, Avatar avatar) {
		User user = this.users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
		if (displayName != null) {
			user.setDisplayName(displayName);
		}
		if (bio != null) {
			user.setBio(bio.isEmpty() ? null : bio);
		}
		if (avatar != null) {
			user.setAvatar(avatar);
		}
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
