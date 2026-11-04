import { useMemo, useState, type FormEvent } from 'react'

interface SearchDiscoveryProps {
  search: string
  location: string
  onSearchChange: (value: string) => void
  onLocationChange: (value: string) => void
  onSubmit: () => void
  suggestions?: string[]
  compact?: boolean
}

const DEFAULT_SUGGESTIONS = [
  'Self-contained apartment',
  'Apartments for rent',
  'Laptops and electronics',
  'Plumbing services',
  'Cleaning services',
  'Land for sale',
  'Furniture',
  'Moving services',
]

export default function SearchDiscovery({
  search,
  location,
  onSearchChange,
  onLocationChange,
  onSubmit,
  suggestions = DEFAULT_SUGGESTIONS,
  compact = false,
}: SearchDiscoveryProps) {
  const [focused, setFocused] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const filteredSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return suggestions
      .filter((item) => !query || item.toLowerCase().includes(query))
      .slice(0, 5)
  }, [search, suggestions])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFocused(false)
    onSubmit()
  }

  function choose(value: string) {
    onSearchChange(value)
    setFocused(false)
    setActiveSuggestion(-1)
  }

  return (
    <div className={`shm-search-discovery ${compact ? 'is-compact' : ''} ${focused ? 'is-focused' : ''}`}>
      <form className="shm-search-form" onSubmit={submit}>
        <label className="shm-search-query">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search marketplace</span>
          <input
            value={search}
            onChange={(event) => { onSearchChange(event.target.value); setActiveSuggestion(-1) }}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 140)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && filteredSuggestions.length) {
                event.preventDefault()
                setFocused(true)
                setActiveSuggestion((current) => (current + 1) % filteredSuggestions.length)
              }
              if (event.key === 'Enter' && activeSuggestion >= 0) {
                event.preventDefault()
                choose(filteredSuggestions[activeSuggestion])
              }
              if (event.key === 'Escape') setFocused(false)
            }}
            placeholder="Find a home, product, service or opportunity..."
            aria-expanded={focused && filteredSuggestions.length > 0}
            aria-autocomplete="list"
          />
          {search && <button type="button" className="shm-search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">×</button>}
        </label>
        <label className="shm-search-place">
          <span aria-hidden="true">⌖</span>
          <span className="sr-only">Location</span>
          <input value={location} onChange={(event) => onLocationChange(event.target.value)} placeholder="Location" />
        </label>
        <button className="shm-search-submit" type="submit">
          <span>Search marketplace</span><span aria-hidden="true">→</span>
        </button>
      </form>
      {focused && filteredSuggestions.length > 0 && (
        <div className="shm-search-suggestions" role="listbox" aria-label="Search suggestions">
          <span className="shm-search-suggestion-label">{search ? 'SUGGESTED SEARCHES' : 'POPULAR DISCOVERIES'}</span>
          {filteredSuggestions.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={activeSuggestion === index}
              key={item}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span aria-hidden="true">⌕</span>{item}<span aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      )}
      <div className="shm-search-discovery-footer">
        <span>Try discovering</span>
        {['Homes', 'Electronics', 'Services', 'Land'].map((item) => (
          <button type="button" key={item} onClick={() => choose(item)}>{item}</button>
        ))}
        <span className="shm-search-live"><i /> Marketplace search</span>
      </div>
    </div>
  )
}
