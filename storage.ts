import { 
  users, type User, type InsertUser, 
  products, type Product, type InsertProduct,
  catalogues, type Catalogue, type InsertCatalogue,
  catalogueProducts, type CatalogueProduct, type InsertCatalogueProduct,
  orders, type Order, type InsertOrder,
  accessRequests, type AccessRequest, type InsertAccessRequest
} from "@shared/schema";
import { nanoid } from "nanoid";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import createMemoryStore from "memorystore";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Product operations
  getProducts(userId: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Catalogue operations
  getCatalogues(userId: number): Promise<Catalogue[]>;
  getCatalogue(id: number): Promise<Catalogue | undefined>;
  getCatalogueByLink(shareableLink: string): Promise<Catalogue | undefined>;
  createCatalogue(catalogue: InsertCatalogue): Promise<Catalogue>;
  updateCatalogue(id: number, catalogue: Partial<InsertCatalogue>): Promise<Catalogue | undefined>;
  deleteCatalogue(id: number): Promise<boolean>;
  incrementCatalogueViews(id: number): Promise<void>;

  // Catalogue Products operations
  addProductToCatalogue(catalogueId: number, productId: number): Promise<CatalogueProduct>;
  removeProductFromCatalogue(catalogueId: number, productId: number): Promise<boolean>;
  getCatalogueProducts(catalogueId: number): Promise<Product[]>;

  // Order operations
  getOrders(userId: number): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByOrderId(orderId: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<Order | undefined>;
  getOrdersByEmail(email: string): Promise<Order[]>; // Added method

  // Access request operations
  createAccessRequest(request: InsertAccessRequest): Promise<number>;
  getAccessRequest(id: number): Promise<AccessRequest | undefined>;
  getAccessRequestByEmail(catalogueId: number, email: string): Promise<AccessRequest | undefined>;
  getAccessRequests(catalogueId: number): Promise<AccessRequest[]>;
  updateAccessRequest(id: number, status: string): Promise<boolean>;

  // Session store
  sessionStore: any;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private catalogues: Map<number, Catalogue>;
  private catalogueProducts: Map<number, CatalogueProduct>;
  private orders: Map<number, Order>;
  private accessRequests: Map<number, AccessRequest>;

  currentUserId: number;
  currentProductId: number;
  currentCatalogueId: number;
  currentCatalogueProductId: number;
  currentOrderId: number;
  currentAccessRequestId: number;
  sessionStore: any;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.catalogues = new Map();
    this.catalogueProducts = new Map();
    this.orders = new Map();
    this.accessRequests = new Map();

    this.currentUserId = 1;
    this.currentProductId = 1;
    this.currentCatalogueId = 1;
    this.currentCatalogueProductId = 1;
    this.currentOrderId = 1;
    this.currentAccessRequestId = 1;

    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const createdAt = new Date();
    const company = insertUser.company ?? null;
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt,
      company
    };
    this.users.set(id, user);
    return user;
  }

  // Product operations
  async getProducts(userId: number): Promise<Product[]> {
    return Array.from(this.products.values()).filter(
      (product) => product.userId === userId,
    );
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentProductId++;
    const createdAt = new Date();
    const description = insertProduct.description ?? null;
    const imageUrl = insertProduct.imageUrl ?? null;
    const category = insertProduct.category ?? null;
    const inStock = insertProduct.inStock ?? null;

    const product: Product = { 
      ...insertProduct, 
      id, 
      createdAt,
      description,
      imageUrl,
      category,
      inStock,
      // Ensure price is stored as string for consistency with database schema
      price: typeof insertProduct.price === 'number' 
        ? insertProduct.price.toString() 
        : insertProduct.price
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: number, productUpdates: Partial<InsertProduct>): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;

    // Make sure price is stored as a string if it's being updated
    const updatesWithStringPrice = {
      ...productUpdates,
      price: productUpdates.price !== undefined 
        ? (typeof productUpdates.price === 'number' 
            ? productUpdates.price.toString() 
            : productUpdates.price)
        : product.price // Keep existing price if not defined in updates
    };

    const updatedProduct: Product = { ...product, ...updatesWithStringPrice };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    return this.products.delete(id);
  }

  // Catalogue operations
  async getCatalogues(userId: number): Promise<Catalogue[]> {
    return Array.from(this.catalogues.values()).filter(
      (catalogue) => catalogue.userId === userId,
    );
  }

  async getCatalogue(id: number): Promise<Catalogue | undefined> {
    return this.catalogues.get(id);
  }

  async getCatalogueByLink(shareableLink: string): Promise<Catalogue | undefined> {
    return Array.from(this.catalogues.values()).find(
      (catalogue) => catalogue.shareableLink === shareableLink,
    );
  }

  async createCatalogue(insertCatalogue: InsertCatalogue): Promise<Catalogue> {
    const id = this.currentCatalogueId++;
    const createdAt = new Date();
    const views = 0;
    const description = insertCatalogue.description ?? null;
    const isPublic = insertCatalogue.isPublic ?? null;

    const catalogue: Catalogue = { 
      ...insertCatalogue, 
      id, 
      createdAt, 
      views,
      description,
      isPublic
    };
    this.catalogues.set(id, catalogue);
    return catalogue;
  }

  async updateCatalogue(id: number, catalogueUpdates: Partial<InsertCatalogue>): Promise<Catalogue | undefined> {
    const catalogue = this.catalogues.get(id);
    if (!catalogue) return undefined;

    const updatedCatalogue: Catalogue = { ...catalogue, ...catalogueUpdates };
    this.catalogues.set(id, updatedCatalogue);
    return updatedCatalogue;
  }

  async deleteCatalogue(id: number): Promise<boolean> {
    return this.catalogues.delete(id);
  }

  async incrementCatalogueViews(id: number): Promise<void> {
    const catalogue = this.catalogues.get(id);
    if (catalogue) {
      const currentViews = catalogue.views || 0;
      catalogue.views = currentViews + 1;
      this.catalogues.set(id, catalogue);
    }
  }

  // Catalogue Products operations
  async addProductToCatalogue(catalogueId: number, productId: number): Promise<CatalogueProduct> {
    const id = this.currentCatalogueProductId++;
    const catalogueProduct: CatalogueProduct = { id, catalogueId, productId };
    this.catalogueProducts.set(id, catalogueProduct);
    return catalogueProduct;
  }

  async removeProductFromCatalogue(catalogueId: number, productId: number): Promise<boolean> {
    const catalogueProduct = Array.from(this.catalogueProducts.values()).find(
      (cp) => cp.catalogueId === catalogueId && cp.productId === productId,
    );

    if (catalogueProduct) {
      return this.catalogueProducts.delete(catalogueProduct.id);
    }

    return false;
  }

  async getCatalogueProducts(catalogueId: number): Promise<Product[]> {
    const catalogueProductEntries = Array.from(this.catalogueProducts.values()).filter(
      (cp) => cp.catalogueId === catalogueId,
    );

    return catalogueProductEntries.map((cp) => this.products.get(cp.productId)!).filter(Boolean);
  }

  // Order operations
  async getOrders(userId: number): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(
      (order) => order.userId === userId,
    );
  }

  async getOrder(id: number): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrderByOrderId(orderId: string): Promise<Order | undefined> {
    return Array.from(this.orders.values()).find(
      (order) => order.orderId === orderId,
    );
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = this.currentOrderId++;
    const orderDate = new Date();
    const orderId = insertOrder.orderId || `ORD-${nanoid(6).toUpperCase()}`;
    const catalogueId = insertOrder.catalogueId ?? null;
    const paymentStatus = insertOrder.paymentStatus || "pending";

    // Create a clean object without any properties not in schema
    const cleanedInsertOrder = {
      userId: insertOrder.userId,
      retailerName: insertOrder.retailerName,
      retailerEmail: insertOrder.retailerEmail,
      retailerCompany: insertOrder.retailerCompany || '',
      items: insertOrder.items,
      amount: typeof insertOrder.amount === 'number' 
        ? insertOrder.amount.toString() 
        : insertOrder.amount
    };

    const order: Order = { 
      ...cleanedInsertOrder, 
      id, 
      orderDate, 
      orderId,
      catalogueId,
      paymentStatus,
    };

    this.orders.set(id, order);
    return order;
  }

  async updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<Order | undefined> {
    const order = Array.from(this.orders.values()).find(
      (o) => o.orderId === orderId,
    );

    if (order) {
      order.paymentStatus = paymentStatus;
      this.orders.set(order.id, order);
      return order;
    }

    return undefined;
  }
  async getOrdersByEmail(email: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter((order) => order.retailerEmail === email);
  }

  // Access request operations
  async createAccessRequest(request: InsertAccessRequest): Promise<number> {
    const id = this.currentAccessRequestId++;
    const message = request.message ?? null;

    const accessRequest: AccessRequest = {
      ...request,
      id,
      message,
      status: request.status || "pending",
      requestDate: new Date()
    };

    this.accessRequests.set(id, accessRequest);
    return id;
  }

  async getAccessRequest(id: number): Promise<AccessRequest | undefined> {
    return this.accessRequests.get(id);
  }

  async getAccessRequestByEmail(catalogueId: number, email: string): Promise<AccessRequest | undefined> {
    return Array.from(this.accessRequests.values()).find(
      (request) => request.catalogueId === catalogueId && request.email === email
    );
  }

  async getAccessRequests(catalogueId: number): Promise<AccessRequest[]> {
    return Array.from(this.accessRequests.values()).filter(
      (request) => request.catalogueId === catalogueId
    );
  }

  async updateAccessRequest(id: number, status: string): Promise<boolean> {
    const request = this.accessRequests.get(id);
    if (!request) return false;

    request.status = status as "pending" | "approved" | "rejected";
    this.accessRequests.set(id, request);
    return true;
  }
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Product operations
  async getProducts(userId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.userId, userId));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    // Make sure price is stored as a string in PostgreSQL
    const productWithStringPrice = {
      ...insertProduct,
      price: typeof insertProduct.price === 'number' 
        ? insertProduct.price.toString() 
        : insertProduct.price
    };

    const [product] = await db.insert(products).values(productWithStringPrice).returning();
    return product;
  }

  async updateProduct(id: number, productUpdates: Partial<InsertProduct>): Promise<Product | undefined> {
    // Make sure price is stored as a string if it's being updated
    // We need to fetch the current product to keep the price if not provided
    let originalProduct;
    if (productUpdates.price === undefined) {
      const [product] = await db.select().from(products).where(eq(products.id, id));
      originalProduct = product;
    }

    const updatesWithStringPrice = {
      ...productUpdates,
      price: productUpdates.price !== undefined 
        ? (typeof productUpdates.price === 'number' 
            ? productUpdates.price.toString() 
            : productUpdates.price)
        : originalProduct?.price // Keep existing price if not defined in updates
    };

    const [updatedProduct] = await db
      .update(products)
      .set(updatesWithStringPrice)
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Catalogue operations
  async getCatalogues(userId: number): Promise<Catalogue[]> {
    return db.select().from(catalogues).where(eq(catalogues.userId, userId));
  }

  async getCatalogue(id: number): Promise<Catalogue | undefined> {
    const [catalogue] = await db.select().from(catalogues).where(eq(catalogues.id, id));
    return catalogue;
  }

  async getCatalogueByLink(shareableLink: string): Promise<Catalogue | undefined> {
    const [catalogue] = await db.select().from(catalogues).where(eq(catalogues.shareableLink, shareableLink));
    return catalogue;
  }

  async createCatalogue(insertCatalogue: InsertCatalogue): Promise<Catalogue> {
    const [catalogue] = await db.insert(catalogues).values(insertCatalogue).returning();
    return catalogue;
  }

  async updateCatalogue(id: number, catalogueUpdates: Partial<InsertCatalogue>): Promise<Catalogue | undefined> {
    const [updatedCatalogue] = await db
      .update(catalogues)
      .set(catalogueUpdates)
      .where(eq(catalogues.id, id))
      .returning();
    return updatedCatalogue;
  }

  async deleteCatalogue(id: number): Promise<boolean> {
    const result = await db.delete(catalogues).where(eq(catalogues.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async incrementCatalogueViews(id: number): Promise<void> {
    // Get current views value first to avoid null issue
    const catalogue = await this.getCatalogue(id);
    if (catalogue) {
      const currentViews = catalogue.views || 0;
      await db
        .update(catalogues)
        .set({ 
          views: currentViews + 1 
        })
        .where(eq(catalogues.id, id));
    }
  }

  // Catalogue Products operations
  async addProductToCatalogue(catalogueId: number, productId: number): Promise<CatalogueProduct> {
    const [catalogueProduct] = await db
      .insert(catalogueProducts)
      .values({ catalogueId, productId })
      .returning();
    return catalogueProduct;
  }

  async removeProductFromCatalogue(catalogueId: number, productId: number): Promise<boolean> {
    const result = await db
      .delete(catalogueProducts)
      .where(
        and(
          eq(catalogueProducts.catalogueId, catalogueId),
          eq(catalogueProducts.productId, productId)
        )
      );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getCatalogueProducts(catalogueId: number): Promise<Product[]> {
    return db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
        category: products.category,
        inStock: products.inStock,
        userId: products.userId,
        createdAt: products.createdAt
      })
      .from(catalogueProducts)
      .innerJoin(products, eq(catalogueProducts.productId, products.id))
      .where(eq(catalogueProducts.catalogueId, catalogueId));
  }

  // Order operations
  async getOrders(userId: number): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.orderDate));
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderByOrderId(orderId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    return order;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const orderId = insertOrder.orderId || `ORD-${nanoid(6).toUpperCase()}`;

    // Create a clean object without any properties not in schema
    const cleanedInsertOrder = {
      userId: insertOrder.userId,
      retailerName: insertOrder.retailerName,
      retailerEmail: insertOrder.retailerEmail,
      retailerCompany: insertOrder.retailerCompany || '',
      items: insertOrder.items,
      catalogueId: insertOrder.catalogueId,
      orderId,
      paymentStatus: insertOrder.paymentStatus || "pending",
      amount: typeof insertOrder.amount === 'number' 
        ? insertOrder.amount.toString() 
        : insertOrder.amount
    };

    const [order] = await db.insert(orders).values(cleanedInsertOrder).returning();
    return order;
  }

  async updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<Order | undefined> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ paymentStatus })
      .where(eq(orders.orderId, orderId))
      .returning();
    return updatedOrder;
  }

  async getOrdersByEmail(email: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.retailerEmail, email));
  }

  // Access request operations
  async createAccessRequest(request: InsertAccessRequest): Promise<number> {
    const [accessRequest] = await db
      .insert(accessRequests)
      .values({
        ...request,
        requestDate: new Date()
      })
      .returning();
    return accessRequest.id;
  }

  async getAccessRequest(id: number): Promise<AccessRequest | undefined> {
    const [accessRequest] = await db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.id, id));
    return accessRequest;
  }

  async getAccessRequestByEmail(catalogueId: number, email: string): Promise<AccessRequest | undefined> {
    const [accessRequest] = await db
      .select()
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.catalogueId, catalogueId),
          eq(accessRequests.email, email)
        )
      );
    return accessRequest;
  }

  async getAccessRequests(catalogueId: number): Promise<AccessRequest[]> {
    return db
      .select()
      .from(accessRequests)
      .where(eq(accessRequests.catalogueId, catalogueId))
      .orderBy(desc(accessRequests.requestDate));
  }

  async updateAccessRequest(id: number, status: string): Promise<boolean> {
    const result = await db
      .update(accessRequests)
      .set({ status: status as "pending" | "approved" | "rejected" })
      .where(eq(accessRequests.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }
}

export const storage = new DatabaseStorage();