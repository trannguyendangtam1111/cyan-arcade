package com.cyan.arcade.tcg.dataimport;

import java.util.List;

/**
 * A source's answer: the dataset to import, and what was found for each configured set.
 *
 * @param dataset the importable sets only; {@code null} when no configured set is importable
 * @param checks one per configured set, in the configuration's order
 */
public record SourceFetch(TcgDataset dataset, List<SetCheck> checks) {

	public SourceFetch {
		checks = (checks != null) ? List.copyOf(checks) : List.of();
	}

	/** Whether any configured set could not be imported this time. */
	public boolean hasHeldBackSets() {
		return this.checks.stream().anyMatch((check) -> check.status() != SetCheck.Status.IMPORTABLE);
	}

}
