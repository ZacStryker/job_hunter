import { Search, X } from 'lucide-react'

interface KeywordFilterInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function KeywordFilterInput({ value, onChange, placeholder = 'Filter…' }: KeywordFilterInputProps) {
  return (
    <div className="relative w-64 max-w-full">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-full rounded border border-zinc-700 bg-zinc-800 pl-7 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear filter"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
