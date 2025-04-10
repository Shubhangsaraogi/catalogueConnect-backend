import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertProductSchema, insertCatalogueSchema, insertOrderSchema, insertAccessRequestSchema } from "@shared/schema";
import { nanoid } from "nanoid";
import { z } from "zod";

// Define btoa and atob functions for Node.js environment (not available by default)
function btoa(str: string): string {
  return Buffer.from(str).toString('base64');
}

function atob(str: string): string {
  return Buffer.from(str, 'base64').toString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Products routes
  app.get("/api/products", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const products = await storage.getProducts(req.user.id);
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      res.json(product);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/products", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log("POST /api/products - Request body:", req.body);
      
      const validatedData = insertProductSchema.parse({
        ...req.body,
        userId: req.user.id
      });
      
      console.log("POST /api/products - Validated data:", validatedData);
      
      const product = await storage.createProduct(validatedData);
      console.log("POST /api/products - Created product:", product);
      
      res.status(201).json(product);
    } catch (error) {
      console.error("POST /api/products - Error:", error);
      next(error);
    }
  });

  app.put("/api/products/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validatedData = insertProductSchema.partial().parse(req.body);
      const updatedProduct = await storage.updateProduct(productId, validatedData);
      
      res.json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/products/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteProduct(productId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Catalogue routes
  app.get("/api/catalogues", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const catalogues = await storage.getCatalogues(req.user.id);
      res.json(catalogues);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/catalogues/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const catalogueId = parseInt(req.params.id);
      const catalogue = await storage.getCatalogue(catalogueId);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const products = await storage.getCatalogueProducts(catalogueId);
      
      res.json({ ...catalogue, products });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/catalogues", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const shareableLink = `catalogue-${nanoid(10)}`;
      
      const validatedData = insertCatalogueSchema.parse({
        ...req.body,
        userId: req.user.id,
        shareableLink
      });
      
      const catalogue = await storage.createCatalogue(validatedData);
      
      // Add products to the catalogue if provided
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        console.log(`Adding ${req.body.productIds.length} products to catalogue ID ${catalogue.id}`);
        
        for (const productId of req.body.productIds) {
          const product = await storage.getProduct(parseInt(productId));
          if (product && product.userId === req.user.id) {
            console.log(`Adding product ID ${product.id} to catalogue ID ${catalogue.id}`);
            try {
              const catalogueProduct = await storage.addProductToCatalogue(catalogue.id, product.id);
              console.log(`Successfully added product to catalogue, result:`, catalogueProduct);
            } catch (err) {
              console.error(`Error adding product ${product.id} to catalogue ${catalogue.id}:`, err);
            }
          }
        }
        
        // Verify products were actually added
        const addedProducts = await storage.getCatalogueProducts(catalogue.id);
        console.log(`After adding, catalogue ${catalogue.id} has ${addedProducts.length} products`);
      }
      
      res.status(201).json(catalogue);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/catalogues/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const catalogueId = parseInt(req.params.id);
      const catalogue = await storage.getCatalogue(catalogueId);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Exclude userId and only update the fields we want to allow
      const { productIds, ...updateData } = req.body;
      const validatedData = insertCatalogueSchema.partial().parse(updateData);
      
      // Remove userId if it's in the data as we don't want to change ownership
      if ('userId' in validatedData) {
        delete validatedData.userId;
      }
      
      console.log('Updating catalogue with data:', JSON.stringify(validatedData));
      const updatedCatalogue = await storage.updateCatalogue(catalogueId, validatedData);
      
      // Update products if provided
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        // Get current products in catalogue
        const currentProducts = await storage.getCatalogueProducts(catalogueId);
        const currentProductIds = currentProducts.map(p => p.id);
        
        // Add new products
        for (const productId of req.body.productIds) {
          if (!currentProductIds.includes(parseInt(productId))) {
            const product = await storage.getProduct(parseInt(productId));
            if (product && product.userId === req.user.id) {
              await storage.addProductToCatalogue(catalogueId, product.id);
            }
          }
        }
        
        // Remove products that are no longer in the list
        for (const currentProductId of currentProductIds) {
          if (!req.body.productIds.includes(currentProductId.toString())) {
            await storage.removeProductFromCatalogue(catalogueId, currentProductId);
          }
        }
      }
      
      res.json(updatedCatalogue);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/catalogues/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const catalogueId = parseInt(req.params.id);
      const catalogue = await storage.getCatalogue(catalogueId);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.deleteCatalogue(catalogueId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Public catalogue info route (basic info without requiring permission)
  app.get("/api/shared/:link/info", async (req, res, next) => {
    try {
      const link = req.params.link;
      const catalogue = await storage.getCatalogueByLink(link);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      // Only return basic info
      res.json({
        name: catalogue.name,
        description: catalogue.description
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Catalogue access request
  app.post("/api/shared/:link/request-access", async (req, res, next) => {
    try {
      const link = req.params.link;
      const { name, email, company, message } = req.body;
      
      if (!name || !email || !company) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const catalogue = await storage.getCatalogueByLink(link);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      // Create access request
      const requestId = await storage.createAccessRequest({
        catalogueId: catalogue.id,
        name,
        email,
        company,
        message: message || "",
        status: "pending",
        requestDate: new Date()
      });
      
      res.status(201).json({ id: requestId, status: "pending" });
    } catch (error) {
      next(error);
    }
  });
  
  // Check access status
  app.post("/api/shared/:link/check-access", async (req, res, next) => {
    try {
      const link = req.params.link;
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      const catalogue = await storage.getCatalogueByLink(link);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      const accessRequest = await storage.getAccessRequestByEmail(catalogue.id, email);
      
      if (!accessRequest) {
        return res.status(404).json({ message: "Access request not found" });
      }
      
      // If approved, generate an access token
      const granted = accessRequest.status === "approved";
      
      if (granted) {
        // Generate a token payload
        const tokenPayload = { 
          catalogueId: catalogue.id, 
          email,
          exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 1 week expiry
        };
        
        // Log token generation
        console.log('Generating token with payload:', JSON.stringify(tokenPayload));
        
        // Simple token generation with better browser compatibility
        const tokenString = JSON.stringify(tokenPayload);
        const accessToken = btoa(tokenString);
        
        console.log('Generated token:', accessToken);
        
        res.json({ granted: true, accessToken });
      } else {
        res.json({ granted: false });
      }
    } catch (error) {
      next(error);
    }
  });
  
  // Get retailer info
  app.post("/api/shared/:link/retailer-info", async (req, res, next) => {
    try {
      const link = req.params.link;
      const { email } = req.body;
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const token = authHeader.substring(7);
      
      try {
        // Decode token with better error handling
        let tokenData;
        try {
          // Try default Node.js decoding
          const decodedString = Buffer.from(token, 'base64').toString();
          tokenData = JSON.parse(decodedString);
          console.log('Retailer-info token data:', JSON.stringify(tokenData));
        } catch (decodeError) {
          console.error('Retailer-info token decode error:', decodeError);
          console.log('Raw token received:', token);
          
          // Try alternative decoding (browser might use different base64 encoding)
          try {
            const decodedString = atob(token);
            tokenData = JSON.parse(decodedString);
            console.log('Retailer-info token data (atob):', JSON.stringify(tokenData));
          } catch (atobError) {
            console.error('atob decode error:', atobError);
            return res.status(401).json({ message: "Invalid token format" });
          }
        }
        
        if (!tokenData || !tokenData.catalogueId || !tokenData.exp) {
          return res.status(401).json({ message: "Invalid token format" });
        }
        
        if (tokenData.exp < Date.now()) {
          return res.status(401).json({ message: "Token expired" });
        }
        
        const catalogue = await storage.getCatalogueByLink(link);
        
        if (!catalogue || catalogue.id !== tokenData.catalogueId) {
          return res.status(404).json({ message: "Catalogue not found" });
        }
        
        const accessRequest = await storage.getAccessRequestByEmail(catalogue.id, email);
        
        if (!accessRequest || accessRequest.status !== "approved") {
          return res.status(404).json({ message: "Access request not found or not approved" });
        }
        
        res.json({
          name: accessRequest.name,
          email: accessRequest.email,
          company: accessRequest.company
        });
      } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
      }
    } catch (error) {
      next(error);
    }
  });
  
  // Get catalogue with products - requires access token
  // Get orders for a shared catalogue
  app.get("/api/shared/:link/orders", async (req, res, next) => {
    try {
      const link = req.params.link;
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const token = authHeader.substring(7);
      let tokenData;
      try {
        const decodedString = Buffer.from(token, 'base64').toString();
        tokenData = JSON.parse(decodedString);
      } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
      }
      
      const catalogue = await storage.getCatalogueByLink(link);
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      const orders = await storage.getOrdersByEmail(tokenData.email);
      res.json(orders);
    } catch (error) {
      next(error);
    }
  });

  // Update order payment status for shared catalogue
  app.put("/api/shared/:link/orders/:orderId/payment-status", async (req, res, next) => {
    try {
      const { link, orderId } = req.params;
      const { status } = req.body;
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const token = authHeader.substring(7);
      let tokenData;
      try {
        const decodedString = Buffer.from(token, 'base64').toString();
        tokenData = JSON.parse(decodedString);
      } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
      }
      
      const order = await storage.getOrderByOrderId(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.retailerEmail !== tokenData.email) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const updatedOrder = await storage.updateOrderPaymentStatus(orderId, status);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/shared/:link/view", async (req, res, next) => {
    try {
      const link = req.params.link;
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized - Missing or invalid authorization header" });
      }
      
      const token = authHeader.substring(7);
      
      // Decode token properly with error handling
      let tokenData;
      try {
        // Properly decode the base64 token
        try {
          const decodedString = Buffer.from(token, 'base64').toString();
          tokenData = JSON.parse(decodedString);
          
          // Log for debugging
          console.log('Token data:', JSON.stringify(tokenData));
        } catch (decodeError) {
          console.error('Token decode error:', decodeError);
          console.log('Raw token received:', token);
          
          // Try alternative decoding (browser might use different base64 encoding)
          try {
            const decodedString = atob(token);
            tokenData = JSON.parse(decodedString);
            console.log('Token data (atob):', JSON.stringify(tokenData));
          } catch (atobError) {
            console.error('atob decode error:', atobError);
            return res.status(401).json({ message: "Invalid token format" });
          }
        }
        
        if (!tokenData || !tokenData.catalogueId || !tokenData.exp) {
          return res.status(401).json({ message: "Invalid token format" });
        }
        
        if (tokenData.exp < Date.now()) {
          return res.status(401).json({ message: "Token expired" });
        }
      } catch (tokenError) {
        console.error("Token parse error:", tokenError);
        return res.status(401).json({ message: "Invalid token format" });
      }
      
      // Get the catalogue
      const catalogue = await storage.getCatalogueByLink(link);
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.id !== tokenData.catalogueId) {
        console.log(`Token catalogueId ${tokenData.catalogueId} doesn't match catalogue id ${catalogue.id}`);
        return res.status(401).json({ message: "Invalid token for this catalogue" });
      }
      
      // Increment views
      await storage.incrementCatalogueViews(catalogue.id);
      
      // Get products for the catalogue
      const products = await storage.getCatalogueProducts(catalogue.id);
      console.log(`Catalogue ID: ${catalogue.id}, Products found: ${products.length}`);
      
      // Get user info for distributor
      const user = await storage.getUser(catalogue.userId);
      if (!user) {
        return res.status(404).json({ message: "Distributor not found" });
      }
      
      const { password, ...userInfo } = user;
      
      // Return the full catalogue with products and distributor info
      res.json({ 
        ...catalogue, 
        products,
        distributor: userInfo
      });
    } catch (error) {
      console.error("Error in shared catalogue view:", error);
      next(error);
    }
  });
  
  // Get access requests for a catalogue
  app.get("/api/catalogues/:id/access-requests", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const catalogueId = parseInt(req.params.id);
      const catalogue = await storage.getCatalogue(catalogueId);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const accessRequests = await storage.getAccessRequests(catalogueId);
      res.json(accessRequests);
    } catch (error) {
      next(error);
    }
  });
  
  // Update access request status
  app.put("/api/access-requests/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const requestId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const accessRequest = await storage.getAccessRequest(requestId);
      
      if (!accessRequest) {
        return res.status(404).json({ message: "Access request not found" });
      }
      
      const catalogue = await storage.getCatalogue(accessRequest.catalogueId);
      
      if (!catalogue) {
        return res.status(404).json({ message: "Catalogue not found" });
      }
      
      if (catalogue.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const updated = await storage.updateAccessRequest(requestId, status);
      
      res.json({ id: requestId, status });
    } catch (error) {
      next(error);
    }
  });

  // Order routes
  app.get("/api/orders", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const orders = await storage.getOrders(req.user.id);
      res.json(orders);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/orders/:orderId", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const order = await storage.getOrderByOrderId(req.params.orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      res.json(order);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/orders", async (req, res, next) => {
    try {
      // For orders placed through shared catalogues, we don't require authentication
      // The authorization token comes from the shared link access
      const orderId = `ORD-${nanoid(6).toUpperCase()}`;
      
      const validatedData = insertOrderSchema.parse({
        ...req.body,
        orderId
      });
      
      const order = await storage.createOrder(validatedData);
      res.status(201).json(order);
    } catch (error) {
      console.error("Order creation error:", error);
      next(error);
    }
  });

  app.put("/api/orders/:orderId/status", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const { paymentStatus } = req.body;
      
      if (!paymentStatus) {
        return res.status(400).json({ message: "Payment status is required" });
      }
      
      const order = await storage.getOrderByOrderId(req.params.orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const updatedOrder = await storage.updateOrderPaymentStatus(req.params.orderId, paymentStatus);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  });

  // Dashboard statistics
  app.get("/api/dashboard/stats", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user.id;
      
      const products = await storage.getProducts(userId);
      const catalogues = await storage.getCatalogues(userId);
      const orders = await storage.getOrders(userId);
      
      // Calculate total views across all catalogues (handling null values)
      const totalViews = catalogues.reduce((sum, catalogue) => sum + (catalogue.views || 0), 0);
      
      // Calculate pending payments
      const pendingPayments = orders
        .filter(order => order.paymentStatus === "pending")
        .reduce((sum, order) => sum + parseFloat(order.amount.toString()), 0);
      
      // Calculate recent orders (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentOrders = orders.filter(
        order => new Date(order.orderDate) >= thirtyDaysAgo
      ).length;
      
      res.json({
        totalProducts: products.length,
        newOrders: recentOrders,
        pendingPayments: pendingPayments.toFixed(2),
        catalogueViews: totalViews
      });
    } catch (error) {
      next(error);
    }
  });

  // Get recent orders for dashboard
  app.get("/api/dashboard/recent-orders", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user.id;
      
      const orders = await storage.getOrders(userId);
      
      // Sort orders by date (newest first) and limit to 5
      const recentOrders = orders
        .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
        .slice(0, 5);
      
      res.json(recentOrders);
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
