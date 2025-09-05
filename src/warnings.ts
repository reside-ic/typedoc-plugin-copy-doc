export const failedToParseEmptyMsg = (target: string) =>
  `Declaration reference in @copyDoc for ${target} was not fully parsed and may resolve incorrectly`;

export const failedToFindMsg = (source: string, target: string) =>
  `Failed to find "${source}" to copy docs from in comment for ${target}`;

export const circularInheritanceMsg = (deps: string) =>
  `@copyDoc specifies a circular inheritance chain: ${deps}`;

export const triedToCopyEmptyCommentMsg = (target: string, source: string) =>
  `${target} tried to copy docs from ${source} with @copyDoc, but the source has no associated comment`;
