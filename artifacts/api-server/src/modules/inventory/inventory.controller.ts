import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { InventoryRepository } from "./inventory.repository";
import { authMiddleware, roleGuard } from "../../middlewares/auth.middleware";
import { ValidationError, NotFoundError } from "../../shared/errors";

const router: IRouter = Router();
const repo = new InventoryRepository();

const categoryValues = [
  "materials",
  "instruments",
  "medications",
  "consumables",
  "prosthetics",
  "implants",
  "other",
] as const;

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(categoryValues).optional(),
  unit: z.string().optional(),
  unitPrice: z.number().min(0).optional(),
  quantity: z.number().min(0).optional(),
  minQuantity: z.number().min(0).optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(categoryValues).optional(),
  unit: z.string().optional(),
  unitPrice: z.number().min(0).optional(),
  minQuantity: z.number().min(0).optional(),
});

const updateStockSchema = z.object({
  quantity: z.number().min(0),
});

router.use(authMiddleware);

const readRoles = roleGuard("owner", "admin", "doctor", "accountant", "warehouse");
const writeRoles = roleGuard("owner", "admin", "warehouse");
const deleteRoles = roleGuard("owner", "admin");

// GET /inventory
router.get("/", readRoles, async (req: Request, res: Response, next: NextFunction) => {
  const items = await repo.list(req.user!.clinicId).catch(next);
  if (!items) return;
  res.json({ success: true, data: { items } });
});

// POST /inventory
router.post("/", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const item = await repo
    .create(
      {
        id: randomUUID(),
        clinicId: req.user!.clinicId,
        name: parsed.data.name,
        category: parsed.data.category,
        unit: parsed.data.unit,
        unitPrice: parsed.data.unitPrice,
      },
      {
        id: randomUUID(),
        quantity: parsed.data.quantity ?? 0,
        minQuantity: parsed.data.minQuantity ?? 0,
      },
    )
    .catch(next);
  if (!item) return;
  res.status(201).json({ success: true, data: { item } });
});

// PUT /inventory/:id
router.put("/:id", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const id = String(req.params["id"]);
  const { minQuantity, ...itemFields } = parsed.data;
  const item = await repo
    .update(id, req.user!.clinicId, itemFields, minQuantity)
    .catch(next);
  if (!item) return next(new NotFoundError("Inventory item not found"));
  res.json({ success: true, data: { item } });
});

// DELETE /inventory/:id
router.delete("/:id", deleteRoles, async (req: Request, res: Response, next: NextFunction) => {
  const id = String(req.params["id"]);
  await repo.deactivate(id, req.user!.clinicId).catch(next);
  res.json({ success: true, message: "Item deactivated" });
});

// PATCH /inventory/:id/stock
router.patch("/:id/stock", writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = updateStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }
  const id = String(req.params["id"]);
  const item = await repo.updateStock(id, req.user!.clinicId, parsed.data.quantity).catch(next);
  if (!item) return next(new NotFoundError("Inventory item not found"));
  res.json({ success: true, data: { item } });
});

export default router;
