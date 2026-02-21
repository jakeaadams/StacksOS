"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, DollarSign, Loader2, RotateCcw } from "lucide-react";
import type { TransactionRow } from "./bills-utils";
import { formatCurrency } from "./bills-utils";

export interface BillsDialogsProps {
  // Payment
  paymentDialogOpen: boolean;
  setPaymentDialogOpen: (open: boolean) => void;
  paymentAmount: string;
  setPaymentAmount: (v: string) => void;
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  paymentNote: string;
  setPaymentNote: (v: string) => void;
  selectedCount: number;
  outstandingCount: number;
  onProcessPayment: () => void;
  // Refund
  refundDialogOpen: boolean;
  setRefundDialogOpen: (open: boolean) => void;
  refundTarget: TransactionRow | null;
  refundAmount: string;
  setRefundAmount: (v: string) => void;
  refundNote: string;
  setRefundNote: (v: string) => void;
  onProcessRefund: () => void;
  // Shared
  isLoading: boolean;
}

export function BillsDialogs(props: BillsDialogsProps) {
  return (
    <>
      <Dialog open={props.paymentDialogOpen} onOpenChange={props.setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Apply a payment to {props.selectedCount > 0 ? props.selectedCount : props.outstandingCount} transaction(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="amount" value={props.paymentAmount} onChange={(e) => props.setPaymentAmount(e.target.value)} className="pl-12 text-lg font-mono" placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="payment-method" className="text-sm font-medium">Payment Method</label>
              <Select id="payment-method" value={props.paymentMethod} onValueChange={props.setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_payment">Cash</SelectItem>
                  <SelectItem value="credit_card_payment">Credit Card</SelectItem>
                  <SelectItem value="debit_card_payment">Debit Card</SelectItem>
                  <SelectItem value="check_payment">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="note" className="text-sm font-medium">Note (optional)</label>
              <Input id="note" value={props.paymentNote} onChange={(e) => props.setPaymentNote(e.target.value)} placeholder="Add note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={props.onProcessPayment} disabled={props.isLoading}>
              {props.isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
              Process Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.refundDialogOpen} onOpenChange={props.setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              {props.refundTarget
                ? `Refund against transaction ${props.refundTarget.xactId}. The API will cap the refund to the refundable amount.`
                : "Select a transaction to refund."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="amount-2" className="text-sm font-medium">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="amount-2" value={props.refundAmount} onChange={(e) => props.setRefundAmount(e.target.value)} className="pl-12 text-lg font-mono" placeholder="0.00" />
              </div>
              {props.refundTarget && <p className="text-xs text-muted-foreground">Paid: {formatCurrency(props.refundTarget.paid)}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="note-2" className="text-sm font-medium">Note (optional)</label>
              <Input id="note-2" value={props.refundNote} onChange={(e) => props.setRefundNote(e.target.value)} placeholder="Reason for refund" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => props.setRefundDialogOpen(false)}>Cancel</Button>
            <Button onClick={props.onProcessRefund} disabled={props.isLoading || !props.refundTarget}>
              {props.isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
