import { useState } from "react";
import { Copy, Check, Code2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface ExportQueryCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: string;
  filter: string;
  project?: string;
  sort?: string;
  limit?: number;
}

type TargetLang = "node" | "go" | "python" | "shell";

export function ExportQueryCodeModal({
  isOpen,
  onClose,
  table,
  filter,
  project,
  sort,
  limit = 50,
}: ExportQueryCodeModalProps) {
  const [lang, setLang] = useState<TargetLang>("node");
  const [copied, setCopied] = useState(false);

  const cleanFilter = filter.trim() || "{}";
  const cleanProject = project?.trim() || "";
  const cleanSort = sort?.trim() || "";

  const generateSnippet = (): string => {
    switch (lang) {
      case "node": {
        let code = `import { MongoClient } from 'mongodb';\n\n`;
        code += `// Connect to MongoDB & execute query\n`;
        code += `const client = new MongoClient(process.env.MONGODB_URI);\n`;
        code += `await client.connect();\n`;
        code += `const db = client.db();\n`;
        code += `const collection = db.collection('${table}');\n\n`;
        code += `const filter = ${cleanFilter};\n`;
        if (cleanProject) code += `const projection = ${cleanProject};\n`;
        if (cleanSort) code += `const sort = ${cleanSort};\n`;
        code += `\nconst cursor = collection.find(filter);\n`;
        if (cleanProject) code += `cursor.project(projection);\n`;
        if (cleanSort) code += `cursor.sort(sort);\n`;
        code += `cursor.limit(${limit});\n\n`;
        code += `const results = await cursor.toArray();\n`;
        code += `console.log(results);\n`;
        return code;
      }

      case "go": {
        let code = `package main\n\nimport (\n\t"context"\n\t"fmt"\n\t"log"\n\n\t"go.mongodb.org/mongo-driver/bson"\n\t"go.mongodb.org/mongo-driver/mongo"\n\t"go.mongodb.org/mongo-driver/mongo/options"\n)\n\nfunc main() {\n`;
        code += `\tctx := context.TODO()\n`;
        code += `\tcoll := client.Database("test").Collection("${table}")\n\n`;
        code += `\tvar filter bson.M\n`;
        code += `\tif err := bson.UnmarshalExtJSON([]byte(\`${cleanFilter}\`), true, &filter); err != nil {\n`;
        code += `\t\tlog.Fatal(err)\n\t}\n\n`;
        code += `\tfindOpts := options.Find().SetLimit(${limit})\n`;
        if (cleanSort) {
          code += `\tvar sortDoc bson.M\n`;
          code += `\t_ = bson.UnmarshalExtJSON([]byte(\`${cleanSort}\`), true, &sortDoc)\n`;
          code += `\tfindOpts.SetSort(sortDoc)\n`;
        }
        if (cleanProject) {
          code += `\tvar projDoc bson.M\n`;
          code += `\t_ = bson.UnmarshalExtJSON([]byte(\`${cleanProject}\`), true, &projDoc)\n`;
          code += `\tfindOpts.SetProjection(projDoc)\n`;
        }
        code += `\n\tcursor, err := coll.Find(ctx, filter, findOpts)\n`;
        code += `\tif err != nil {\n\t\tlog.Fatal(err)\n\t}\n`;
        code += `\tdefer cursor.Close(ctx)\n\n`;
        code += `\tvar docs []bson.M\n`;
        code += `\tif err := cursor.All(ctx, &docs); err != nil {\n\t\tlog.Fatal(err)\n\t}\n`;
        code += `\tfmt.Printf("Retrieved %d documents\\n", len(docs))\n}\n`;
        return code;
      }

      case "python": {
        let code = `from pymongo import MongoClient\nimport os\n\n`;
        code += `client = MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017"))\n`;
        code += `db = client.get_default_database()\n`;
        code += `collection = db["${table}"]\n\n`;
        code += `filter_query = ${cleanFilter}\n`;
        if (cleanProject) code += `projection = ${cleanProject}\n`;
        if (cleanSort) code += `sort_order = ${cleanSort}\n`;
        code += `\ncursor = collection.find(filter_query`;
        if (cleanProject) code += `, projection`;
        code += `)`;
        if (cleanSort) code += `.sort(sort_order)`;
        code += `.limit(${limit})\n\n`;
        code += `results = list(cursor)\nprint(f"Found {len(results)} records")\n`;
        return code;
      }

      case "shell": {
        let code = `db.${table}.find(\n  ${cleanFilter}`;
        if (cleanProject) code += `,\n  ${cleanProject}`;
        code += `\n)`;
        if (cleanSort) code += `.sort(${cleanSort})`;
        code += `.limit(${limit});\n`;
        return code;
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-3 p-4 sm:max-w-2xl">
        <DialogHeader className="gap-1">
          <div className="flex items-center gap-2">
            <Code2 className="text-primary size-4.5" />
            <DialogTitle className="text-base font-semibold">
              Export Query to Language
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs">
            Convert the current filter, projection, and sort into executable
            driver snippets.
          </DialogDescription>
        </DialogHeader>

        {/* Language Tabs */}
        <div className="border-border/80 flex items-center justify-between border-b pb-2">
          <div className="bg-muted/60 border-border/60 flex items-center gap-1 rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setLang("node")}
              className={cn(
                "cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                lang === "node"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Node.js
            </button>
            <button
              type="button"
              onClick={() => setLang("go")}
              className={cn(
                "cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                lang === "go"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => setLang("python")}
              className={cn(
                "cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                lang === "python"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Python
            </button>
            <button
              type="button"
              onClick={() => setLang("shell")}
              className={cn(
                "cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                lang === "shell"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              mongosh
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-7 cursor-pointer gap-1.5 font-mono text-xs"
          >
            {copied ? (
              <>
                <Check className="text-success size-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </Button>
        </div>

        {/* Code Snippet Box */}
        <div className="border-border bg-card/80 text-foreground relative max-h-80 overflow-x-auto rounded-lg border p-3 font-mono text-xs">
          <pre className="font-mono leading-5 whitespace-pre-wrap select-text">
            {generateSnippet()}
          </pre>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 font-mono text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
