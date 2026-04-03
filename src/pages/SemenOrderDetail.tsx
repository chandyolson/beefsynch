import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, FileDown, Pencil } from "lucide-react";
import NewOrderDialog, { EditOrderData } from "@/components/NewOrderDialog";
import { generateOrderPdf } from "@/lib/generateOrderPdf";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import ClickableRegNumber from "@/components/ClickableRegNumber";

interface OrderRow {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  project_id: string | null;
  semen_company_id: string | null;
  notes: string | null;
  placed_by: string | null;
  order_type: string;
}

interface ItemRow {
  id: string;
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
    naab_code: string | null;
    breed: string;
  } | null;
}

interface ProjectRef {
  id: string;
  name: string;
}

const fulfillmentColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  backordered: "bg-red-500/20 text-red-300 border-red-500/30",
  "partially filled": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  ordered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  delivered: "bg-green-500/20 text-green-300 border-green-500/30",
};

const billingColors: Record<string, string> = {
  unbilled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  invoiced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

const SemenOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [oRes, iRes] = await Promise.all([
      supabase.from("semen_orders").select("*").eq("id", id).single(),
      supabase
        .from("semen_order_items")
        .select("*, bulls_catalog(bull_name, company, registration_number, naab_code, breed)")
        .eq("semen_order_id", id),
    ]);

    if (oRes.data) {
      setOrder(oRes.data as OrderRow);
      if (oRes.data.project_id) {
        const { data: pData } = await supabase
          .from("projects")
          .select("id, name")
          .eq("id", oRes.data.project_id)
          .single();
        if (pData) setProject(pData as ProjectRef);
      }
      if (oRes.data.semen_company_id) {
        const { data: cData } = await supabase
          .from("semen_companies")
          .select("name")
          .eq("id", oRes.data.semen_company_id)
          .single();
        if (cData) setCompanyName(cData.name);
      } else {
        setCompanyName(null);
      }
    }
    if (iRes.data) setItems(iRes.data as ItemRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const openEdit = () => {
    if (!order) return;
    setEditOpen(true);
  };

  const getEditData = (): EditOrderData | null => {
    if (!order) return null;
    return {
      id: order.id,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      order_date: order.order_date,
      fulfillment_status: order.fulfillment_status,
      billing_status: order.billing_status,
      project_id: order.project_id,
      semen_company_id: order.semen_company_id,
      notes: order.notes,
      placed_by: order.placed_by,
      order_type: order.order_type,
      bulls: items.map((i) => ({
        name: i.bulls_catalog?.bull_name || i.custom_bull_name || "",
        catalogId: i.bull_catalog_id,
        naabCode: i.bulls_catalog?.naab_code ?? null,
        units: i.units,
      })),
    };
  };

  const handleExportPdf = () => {
    if (!order) return;
    generateOrderPdf(
      { ...order, project_name: project?.name || null },
      items
    );
    toast({ title: "PDF downloaded" });
  };

  const totalUnits = items.reduce((s, i) => s + (i.units || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Order not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Top actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/inventory-dashboard?tab=orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            <Button size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          </div>
        </div>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display tracking-tight">{order.customer_name || "—"}</h1>
            {order.order_type === "inventory" && (
              <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                Inventory Order
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Order Date: {format(parseISO(order.order_date), "MMMM d, yyyy")}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={cn("capitalize text-xs", fulfillmentColors[order.fulfillment_status] || "")}>
              {order.fulfillment_status}
            </Badge>
            <Badge variant="outline" className={cn("capitalize text-xs", billingColors[order.billing_status] || "")}>
              {order.billing_status}
            </Badge>
          </div>
        </div>

        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Customer Name</span>
              <p className="font-medium">{order.customer_name || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="font-medium">{order.customer_phone || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email</span>
              <p className="font-medium">{order.customer_email || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Order Date</span>
              <p className="font-medium">{format(parseISO(order.order_date), "MMMM d, yyyy")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Placed By</span>
              <p className="font-medium">{order.placed_by || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fulfillment Status</span>
              <p className="font-medium capitalize">{order.fulfillment_status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Billing Status</span>
              <p className="font-medium capitalize">{order.billing_status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Semen Company</span>
              <p className="font-medium">{companyName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Linked Project</span>
              <p className="font-medium">
                {project ? (
                  <Link to={`/project/${project.id}`} className="text-primary hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="font-medium whitespace-pre-wrap">{order.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Bulls & Units card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulls & Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Bull Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Reg #</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No bulls added to this order.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.bulls_catalog?.bull_name || item.custom_bull_name || "Unknown"}{item.bulls_catalog?.naab_code ? ` (${item.bulls_catalog.naab_code})` : ""}
                          </TableCell>
                          <TableCell>{item.bulls_catalog?.company || "—"}</TableCell>
                          <TableCell>
                            {item.bulls_catalog?.registration_number ? (
                              <ClickableRegNumber
                                registrationNumber={item.bulls_catalog.registration_number}
                                breed={item.bulls_catalog.breed}
                              />
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">{item.units}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/20 font-bold">
                        <TableCell colSpan={3} className="text-right">Total</TableCell>
                        <TableCell className="text-right">{totalUnits}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <NewOrderDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) load();
        }}
        editData={getEditData()}
      />
      <AppFooter />
    </div>
  );
};

export default SemenOrderDetail;
