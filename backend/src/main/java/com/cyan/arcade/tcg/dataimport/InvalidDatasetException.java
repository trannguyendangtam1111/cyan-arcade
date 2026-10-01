package com.cyan.arcade.tcg.dataimport;

import java.util.List;

/** A dataset that cannot be imported, with everything that is wrong with it. */
public class InvalidDatasetException extends RuntimeException {

	private final List<String> problems;

	InvalidDatasetException(String source, List<String> problems) {
		super("The dataset %s cannot be imported:%n - %s".formatted(source, String.join("%n - ".formatted(), problems)));
		this.problems = List.copyOf(problems);
	}

	public List<String> getProblems() {
		return this.problems;
	}

}
