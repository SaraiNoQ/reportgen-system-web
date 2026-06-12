import { Suspense } from "react";
import { AccountClient } from "@/components/pages/account-client";
import { Card } from "@/components/ui/card";

export default function AccountPage() {
  return (
    <Suspense fallback={<Card className="p-6 text-sm text-warm-stone">账号中心加载中...</Card>}>
      <AccountClient />
    </Suspense>
  );
}
