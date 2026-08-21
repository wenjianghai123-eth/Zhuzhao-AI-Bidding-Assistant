import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="页面加载中">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} size="sm">
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="space-y-3 border-b">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only">正在加载页面数据</span>
    </div>
  );
}
