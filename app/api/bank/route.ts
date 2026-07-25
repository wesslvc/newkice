import { NextResponse } from "next/server";
import { getBank } from "@/lib/data";

export async function GET() {
  const bank = await getBank();
  return NextResponse.json(bank);
}
