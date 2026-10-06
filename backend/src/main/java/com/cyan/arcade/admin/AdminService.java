package com.cyan.arcade.admin;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.cyan.arcade.admin.AdminDtos.GrantResponse;
import com.cyan.arcade.admin.AdminDtos.StatsResponse;
import com.cyan.arcade.admin.AdminDtos.UserSummary;
import com.cyan.arcade.common.platform.ActivityStatistics;
import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.economy.CoinTransaction;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.progression.Levels;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.user.UserAccount;
import com.cyan.arcade.user.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What admins can see and do. Every method needs {@code ROLE_ADMIN}, here as well as on the
 * controller and in the security configuration.
 */
@Service
@PreAuthorize("hasRole('ADMIN')")
class AdminService {

	private static final Logger log = LoggerFactory.getLogger(AdminService.class);

	static final String GRANT = "ADMIN_GRANT";

	/** How far back a player counts as active. */
	static final Duration ACTIVE_WINDOW = Duration.ofDays(7);

	static final int SEARCH_LIMIT = 20;

	private final UserService users;

	private final ScoreQueries scores;

	private final CoinService coins;

	private final List<ActivityStatistics> activityStatistics;

	private final JdbcClient jdbc;

	private final Clock clock;

	AdminService(UserService users, ScoreQueries scores, CoinService coins,
			ObjectProvider<ActivityStatistics> activityStatistics, JdbcClient jdbc, Clock clock) {
		this.users = users;
		this.scores = scores;
		this.coins = coins;
		this.activityStatistics = activityStatistics.orderedStream().toList();
		this.jdbc = jdbc;
		this.clock = clock;
	}

	/** A handful of counts, most of them through an index; nothing is kept between calls. */
	@Transactional(readOnly = true)
	public StatsResponse stats() {
		Instant now = this.clock.instant();
		Instant startOfToday = LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant();
		List<StatsResponse.Activity> activities = this.activityStatistics.stream()
			.flatMap((source) -> source.overall(startOfToday).stream())
			.map((stat) -> new StatsResponse.Activity(stat.key(), stat.label(), stat.value(), stat.today()))
			.toList();
		return new StatsResponse(this.users.count(), activeUsersSince(now.minus(ACTIVE_WINDOW)),
				this.users.countCreatedSince(startOfToday), this.scores.countAll(), this.scores.countSince(startOfToday),
				this.coins.inCirculation(), activities, now);
	}

	/** Accounts whose username contains a text, with their level and coins. */
	@Transactional(readOnly = true)
	public List<UserSummary> searchUsers(String text) {
		return this.users.search(text.strip(), SEARCH_LIMIT).stream().map(this::toSummary).toList();
	}

	/**
	 * Gives a player coins, recorded in their ledger as an {@code ADMIN_GRANT} with the admin who gave
	 * them and why. The amount is limited and positive (checked on the request, and again by the
	 * ledger); repeating a request with the same id grants once.
	 */
	@Transactional
	public GrantResponse grant(Long adminId, Long userId, int amount, String reason, UUID requestId) {
		UserAccount player = this.users.get(userId);
		CoinReference reference = CoinReference.of(GRANT, requestId);
		String description = "Granted by an admin: " + reason.strip();
		Optional<CoinTransaction> granted = this.coins.grant(userId, amount, reference, description, adminId);
		if (granted.isEmpty()) {
			CoinTransaction earlier = this.coins.find(userId, CoinTransactionType.ADMIN_GRANT, reference).orElseThrow();
			return new GrantResponse(earlier.id(), userId, player.username(), earlier.amount(),
					this.coins.balanceOf(userId), true);
		}
		// Who gave what to whom is in the ledger; the log line is for operators watching the server.
		log.info("Admin {} granted {} coins to user {}", adminId, amount, userId);
		return new GrantResponse(granted.get().id(), userId, player.username(), amount, granted.get().balanceAfter(),
				false);
	}

	private UserSummary toSummary(UserAccount account) {
		return new UserSummary(account.id(), account.username(), account.role(), Levels.levelFor(account.xp()),
				this.coins.balanceOf(account.id()), account.createdAt());
	}

	/**
	 * A read-only report across the platform's own tables: accounts that finished a game or whose
	 * coins changed (earned, spent, claimed a daily reward) since a moment.
	 */
	private long activeUsersSince(Instant since) {
		return this.jdbc.sql("""
				SELECT count(*) FROM (
				    SELECT user_id FROM scores WHERE user_id IS NOT NULL AND created_at >= :since
				    UNION
				    SELECT user_id FROM coin_transactions WHERE created_at >= :since
				) active
				""").param("since", OffsetDateTime.ofInstant(since, ZoneOffset.UTC)).query(Long.class).single();
	}

}
