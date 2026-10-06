package com.cyan.arcade.dailylogin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.dailylogin.DailyLoginResponse.Claimed;
import com.cyan.arcade.dailylogin.DailyLoginResponse.Day;
import com.cyan.arcade.dailylogin.DailyLoginResponse.State;
import com.cyan.arcade.dailylogin.DailyLoginStore.Claim;
import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.shop.ShopService;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The daily login reward: once per calendar day, more for every day in a row, and something extra
 * at the end of each run of days.
 *
 * <p>The day is always the server's, in UTC (when every day in the arcade starts, as for daily
 * challenges and the pack allowance); a client's date is never asked for. A day can be claimed
 * once: the primary key of {@code daily_logins} decides between two requests at the same moment,
 * and the coins refer to the day, so they could not be paid twice either.
 */
@Service
@EnableConfigurationProperties(DailyLoginProperties.class)
public class DailyLoginService {

	public static final String ALREADY_CLAIMED = "DAILY_LOGIN_ALREADY_CLAIMED";

	static final String REFERENCE_TYPE = "DAILY_LOGIN";

	private final DailyLoginStore store;

	private final CoinService coins;

	private final ShopService shop;

	private final DailyLoginProperties properties;

	private final Clock clock;

	DailyLoginService(DailyLoginStore store, CoinService coins, ShopService shop, DailyLoginProperties properties,
			Clock clock) {
		this.store = store;
		this.coins = coins;
		this.shop = shop;
		this.properties = properties;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public DailyLoginResponse statusOf(Long userId) {
		return statusAt(userId, this.clock.instant());
	}

	/**
	 * Claims today's reward.
	 * @throws ConflictException ({@value #ALREADY_CLAIMED}) when today's was already claimed;
	 * nothing is given twice
	 */
	@Transactional
	public Claimed claim(Long userId) {
		return claimAt(userId, this.clock.instant());
	}

	Claimed claimAt(Long userId, Instant now) {
		LocalDate today = dayOf(now);
		int streak = this.store.find(userId, today.minusDays(1)).map(Claim::streak).orElse(0) + 1;
		int day = this.properties.dayOf(streak);
		int reward = this.properties.coinsFor(day);
		if (!this.store.insert(userId, today, streak, reward, now)) {
			throw new ConflictException(ALREADY_CLAIMED, "Today's reward has already been claimed. Come back tomorrow!");
		}

		this.coins.credit(userId, CoinTransactionType.DAILY_LOGIN, reward, CoinReference.of(REFERENCE_TYPE, today),
				"Daily login, day %d".formatted(day));
		String bonusItem = null;
		if (this.properties.hasBonusOn(day)) {
			this.shop.give(userId, this.properties.bonusItem(), this.properties.bonusItemUnits());
			bonusItem = this.shop.nameOf(this.properties.bonusItem());
		}
		return new Claimed(day, streak, reward, bonusItem, this.coins.balanceOf(userId), statusAt(userId, now));
	}

	DailyLoginResponse statusAt(Long userId, Instant now) {
		LocalDate today = dayOf(now);
		Optional<Claim> claimedToday = this.store.find(userId, today);
		int streak = claimedToday.map(Claim::streak)
			.orElseGet(() -> this.store.find(userId, today.minusDays(1)).map(Claim::streak).orElse(0));
		int day = this.properties.dayOf(claimedToday.isPresent() ? streak : streak + 1);
		String bonusName = this.shop.nameOf(this.properties.bonusItem());

		List<Day> days = IntStream.rangeClosed(1, this.properties.cycleLength()).mapToObj((index) -> {
			State state;
			if (index < day || (index == day && claimedToday.isPresent())) {
				state = State.CLAIMED;
			}
			else {
				state = (index == day) ? State.TODAY : State.UPCOMING;
			}
			return new Day(index, this.properties.coinsFor(index), this.properties.hasBonusOn(index) ? bonusName : null,
					state);
		}).toList();
		return new DailyLoginResponse(today, claimedToday.isPresent(), streak, day, days,
				today.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
	}

	private static LocalDate dayOf(Instant instant) {
		return LocalDate.ofInstant(instant, ZoneOffset.UTC);
	}

}
