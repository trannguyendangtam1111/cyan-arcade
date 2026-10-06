package com.cyan.arcade.user;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

interface UserRepository extends Repository<User, Long> {

	User saveAndFlush(User user);

	Optional<User> findById(Long id);

	List<User> findByIdIn(Collection<Long> ids);

	/**
	 * Written out rather than derived from the method name: a derived "IgnoreCase" query compares
	 * {@code upper(username)}, which the unique index on {@code lower(username)} cannot serve.
	 */
	@Query("select u from User u where lower(u.username) = lower(:username)")
	Optional<User> findByUsernameIgnoreCase(String username);

	@Query("select count(u) > 0 from User u where lower(u.username) = lower(:username)")
	boolean existsByUsernameIgnoreCase(String username);

	long count();

	long countByCreatedAtGreaterThanEqual(Instant since);

	/** Players whose name contains a text, for admins looking someone up. {@code pattern} is a LIKE pattern. */
	@Query("select u from User u where lower(u.username) like lower(:pattern) escape '\\' order by lower(u.username)")
	List<User> findByUsernameLike(String pattern, Limit limit);

	/** Adds XP in the database itself, so concurrent awards cannot overwrite each other. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("update User u set u.xp = u.xp + :amount where u.id = :id")
	int addXp(Long id, int amount);

}
