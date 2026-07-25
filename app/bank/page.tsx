import BankBrowser from "@/components/BankBrowser";
import { getBank } from "@/lib/data";

export default function BankPage() {
  const bank = getBank();
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">문제은행</h1>
      <BankBrowser bank={bank} />
    </div>
  );
}
