export const SUBSCRIPTION_EVENT = "seeword:subscription";
export interface SubscriptionChange {
  slug: string;
  subscribed: boolean;
}
export function publishSubscription(change: SubscriptionChange) {
  window.dispatchEvent(new CustomEvent<SubscriptionChange>(SUBSCRIPTION_EVENT, { detail: change }));
}
