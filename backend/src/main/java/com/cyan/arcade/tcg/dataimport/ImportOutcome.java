package com.cyan.arcade.tcg.dataimport;

import java.util.List;

/**
 * What the import job did with one source or dataset file: the checks of its sets, what the import
 * wrote, or why it failed. The job logs these, and writes them to its report file when asked to.
 *
 * @param source the source's id, or the dataset file
 * @param from where the data came from
 * @param sets what the source found for each configured set; empty for a dataset file
 * @param report what the import wrote, or would write on a dry run; {@code null} when nothing was
 * imported
 * @param failure why nothing of this source was written, when it failed
 */
public record ImportOutcome(String source, String from, Status status, List<SetCheck> sets, ImportReport report,
		String failure) {

	public ImportOutcome {
		sets = (sets != null) ? List.copyOf(sets) : List.of();
	}

	static ImportOutcome failed(String source, String from, List<SetCheck> sets, Exception failure) {
		String message = (failure.getMessage() != null) ? failure.getMessage() : failure.getClass().getSimpleName();
		return new ImportOutcome(source, from, Status.FAILED, sets, null, message);
	}

	public enum Status {

		/** The importable sets were written. */
		IMPORTED,

		/** The importable sets were imported and rolled back: the report says what would change. */
		DRY_RUN,

		/** No configured set could be imported now; nothing was written. */
		NOTHING_TO_IMPORT,

		/** Nothing of this source was written. */
		FAILED

	}

}
