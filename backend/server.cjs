@@ .. @@
 const app = express();
 app.use(cors());
+app.use(cors({
+    origin: ['http://localhost:3000', 'http://localhost:5173', 'https://qumail-quantum-secur-0rte.bolt.host'],
+    credentials: true,
+    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
+    allowedHeaders: ['Content-Type', 'Authorization']
+}));
 app.use(express.json());