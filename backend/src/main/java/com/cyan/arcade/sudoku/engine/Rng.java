package com.cyan.arcade.sudoku.engine;

/**
 * SplitMix64: a small random generator spelled out here rather than borrowed from the JDK, so the
 * same seed gives the same puzzle on every Java version and machine, today and later.
 */
public final class Rng {

	private long state;

	public Rng(long seed) {
		this.state = seed;
	}

	public long nextLong() {
		long z = (this.state += 0x9E3779B97F4A7C15L);
		z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
		z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
		return z ^ (z >>> 31);
	}

	/** A number from 0 (inclusive) to {@code bound} (exclusive). */
	public int nextInt(int bound) {
		if (bound <= 0) {
			throw new IllegalArgumentException("bound must be positive");
		}
		return (int) Long.remainderUnsigned(nextLong(), bound);
	}

	/** Shuffles in place (Fisher–Yates). */
	public void shuffle(int[] values) {
		for (int index = values.length - 1; index > 0; index--) {
			int other = nextInt(index + 1);
			int swap = values[index];
			values[index] = values[other];
			values[other] = swap;
		}
	}

	/** One seed made from another and a number, e.g. a day: the same pair always gives the same seed. */
	public static long mix(long seed, long salt) {
		return new Rng(seed ^ (salt * 0xD1B54A32D192ED03L)).nextLong();
	}

}
