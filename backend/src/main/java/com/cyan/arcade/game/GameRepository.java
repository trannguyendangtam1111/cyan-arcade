package com.cyan.arcade.game;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.repository.Repository;

interface GameRepository extends Repository<Game, Long> {

	List<Game> findByActiveTrueOrderByDisplayOrderAscNameAsc();

	Optional<Game> findBySlugAndActiveTrue(String slug);

	Optional<Game> findById(Long id);

	List<Game> findByIdIn(Collection<Long> ids);

}
