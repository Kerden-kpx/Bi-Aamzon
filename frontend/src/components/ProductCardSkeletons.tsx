type ProductCardSkeletonsProps = {
  count?: number;
  keyPrefix?: string;
};

export function ProductCardSkeletons({
  count = 8,
  keyPrefix = "product-skeleton",
}: ProductCardSkeletonsProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`${keyPrefix}-${idx}`}
          className="rounded-3xl border border-gray-100 bg-white p-5 animate-pulse"
        >
          <div className="h-6 w-12 rounded-lg bg-[#E9EDF3] mb-4" />
          <div className="h-40 rounded-2xl bg-[#EEF2F7] mb-5" />
          <div className="h-4 w-4/5 rounded bg-[#E9EDF3] mb-2" />
          <div className="h-4 w-2/3 rounded bg-[#E9EDF3] mb-4" />
          <div className="h-3 w-2/5 rounded bg-[#E9EDF3] mb-2" />
          <div className="h-3 w-3/5 rounded bg-[#E9EDF3] mb-2" />
          <div className="h-3 w-1/2 rounded bg-[#E9EDF3] mb-5" />
          <div className="h-10 w-full rounded-2xl bg-[#E9EDF3]" />
        </div>
      ))}
    </>
  );
}
