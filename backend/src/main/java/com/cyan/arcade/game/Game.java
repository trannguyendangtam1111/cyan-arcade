package com.cyan.arcade.game;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A game listed in the arcade catalog. Rows are managed by Flyway migrations (adding a game means
 * adding a migration), so the entity is read-only from the application's point of view.
 */
@Entity
@Table(name = "games")
class Game {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true, updatable = false)
	private String slug;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private GameCategory category;

	@Column(name = "thumbnail_url", nullable = false)
	private String thumbnailUrl;

	@Column(name = "accent_color", nullable = false)
	private String accentColor;

	/** Used by queries only: inactive games are filtered out in the database. */
	@Column(nullable = false)
	private boolean active;

	/** Used by queries only: the catalog is sorted in the database. */
	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	@Column(name = "max_score")
	private Integer maxScore;

	@Column(nullable = false)
	private boolean featured;

	protected Game() {
	}

	Long getId() {
		return this.id;
	}

	String getSlug() {
		return this.slug;
	}

	String getName() {
		return this.name;
	}

	String getDescription() {
		return this.description;
	}

	GameCategory getCategory() {
		return this.category;
	}

	String getThumbnailUrl() {
		return this.thumbnailUrl;
	}

	String getAccentColor() {
		return this.accentColor;
	}

	/** Highest plausible score, or {@code null} when the game has no practical maximum. */
	Integer getMaxScore() {
		return this.maxScore;
	}

	/** Whether the hub puts this game in the spotlight. */
	boolean isFeatured() {
		return this.featured;
	}

}
