package com.cyan.arcade.minesweeper.daily;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.Arrays;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Each date's shared board, made from the date under a server-side secret: an HMAC-SHA256 of the date
 * gives the seed and the opening cell, and the mines are laid from the seed around that cell, so the
 * opening and its neighbours are clear. Without the secret nobody can tell any date's board, so none
 * can be worked out ahead of its day; neither the seed nor the mines are ever sent anywhere.
 *
 * <p>The secret is {@code app.minesweeper.daily.secret} ({@code MINESWEEPER_DAILY_SECRET}). When it is
 * not set, a random one is made for this run of the server: boards already stored stay as they are,
 * since a stored board is the day's for good, but other dates then get other boards after a restart.
 * Any deployment that runs the Daily Board should set it.
 */
@Component
@EnableConfigurationProperties(DailySeeds.SecretProperties.class)
class DailySeeds {

	private static final Logger log = LoggerFactory.getLogger(DailySeeds.class);

	private static final String ALGORITHM = "HmacSHA256";

	/** Tries at a board whose opening does not already clear it, far more than ever needed. */
	private static final int MAX_TRIES = 64;

	private final SecretKeySpec key;

	DailySeeds(SecretProperties properties) {
		byte[] secret;
		if (properties.secret() == null || properties.secret().isBlank()) {
			secret = new byte[32];
			new SecureRandom().nextBytes(secret);
			log.warn("MINESWEEPER_DAILY_SECRET is not set: Daily Board seeds use a random secret for this run only");
		}
		else {
			secret = properties.secret().getBytes(StandardCharsets.UTF_8);
		}
		this.key = new SecretKeySpec(secret, ALGORITHM);
	}

	/**
	 * A date's board, the same every time for the same secret and date.
	 * @param seed the unsigned 32-bit seed the mines were laid from
	 * @param startCell the opening cell: never on the board's edge, and it and its neighbours are clear
	 * @param mineCells the mines' cells, lowest first
	 */
	record SharedBoard(long seed, int startCell, int[] mineCells) {

		DailyLayout layout(DailyBoard board) {
			return DailyLayout.withMines(board, this.mineCells);
		}

		@Override
		public boolean equals(Object other) {
			return other instanceof SharedBoard that && this.seed == that.seed && this.startCell == that.startCell
					&& Arrays.equals(this.mineCells, that.mineCells);
		}

		@Override
		public int hashCode() {
			return Long.hashCode(this.seed) * 31 + this.startCell * 17 + Arrays.hashCode(this.mineCells);
		}

		@Override
		public String toString() {
			// Mines and seed stay out of logs.
			return "SharedBoard[startCell=%d]".formatted(this.startCell);
		}

	}

	/**
	 * Makes that date's board. A board whose opening alone would uncover every safe cell is passed over
	 * for the next one the date gives, so every attempt has something left to play.
	 */
	SharedBoard boardFor(LocalDate date, DailyBoard board) {
		for (int attempt = 0; attempt < MAX_TRIES; attempt++) {
			ByteBuffer digest = ByteBuffer.wrap(digest("minesweeper-daily|v%d|%s|%d"
				.formatted(DailyBoardSchedule.LAYOUT_VERSION, date, attempt)));
			long seed = Integer.toUnsignedLong(digest.getInt());
			int startCell = interiorCell(board, Integer.toUnsignedLong(digest.getInt()));
			DailyLayout layout = DailyLayout.lay(board, seed, startCell);
			char[] covered = new char[board.cells()];
			Arrays.fill(covered, DailyPlay.HIDDEN);
			if (DailyPlay.reveal(layout, covered, 0, 0, startCell).result() == DailyPlay.Result.PLAYING) {
				return new SharedBoard(seed, startCell, layout.mineCells());
			}
		}
		throw new IllegalStateException("No playable Daily Board for " + date);
	}

	/** A cell off the board's edge, so the opening is a full 3 × 3 clear area (any cell on a thin board). */
	private static int interiorCell(DailyBoard board, long bits) {
		if (board.rows() < 3 || board.columns() < 3) {
			return (int) (bits % board.cells());
		}
		int innerColumns = board.columns() - 2;
		int inner = (int) (bits % ((long) (board.rows() - 2) * innerColumns));
		return (1 + inner / innerColumns) * board.columns() + 1 + inner % innerColumns;
	}

	private byte[] digest(String message) {
		try {
			Mac mac = Mac.getInstance(ALGORITHM);
			mac.init(this.key);
			return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("HmacSHA256 is not available", ex);
		}
	}

	/** @param secret the key the boards are made with; kept out of logs */
	@ConfigurationProperties("app.minesweeper.daily")
	record SecretProperties(String secret) {

		@Override
		public String toString() {
			return "SecretProperties[secret=%s]".formatted((this.secret == null || this.secret.isBlank()) ? "unset" : "set");
		}

	}

}
