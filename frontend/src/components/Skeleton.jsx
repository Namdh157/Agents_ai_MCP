import React from 'react'

export default function Skeleton({
  width = '100%',
  height = 12,
  radius = 8,
  style = {},
  className = '',
}) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}
