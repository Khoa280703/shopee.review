-- Full-text search index matching the search query expression in SearchService
CREATE INDEX IF NOT EXISTS posts_search_idx
  ON posts
  USING GIN (to_tsvector('simple', title || ' ' || coalesce(content, '')));
