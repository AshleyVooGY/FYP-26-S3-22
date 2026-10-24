export function publishingFingerprint(values) {
 return JSON.stringify({title:values.title.trim(),content:values.content.trim(),primaryCategoryId:values.categoryIds[0]?String(values.categoryIds[0]):null,
 categoryIds:values.categoryIds.map(String).sort(),tagIds:values.tagIds.map(String).sort()});
}
export function isPublishReviewReady(result,review,checked,current,reviewFingerprint,now=Date.now()) {
 return Boolean(result?.receiptId && result.score>=80 && !result.criticalIssue && checked===current && reviewFingerprint===current
  && Date.parse(result.expiresAt)>now && review && ['ai_passed','approved'].includes(review.status) && Date.parse(review.expires_at)>now);
}
