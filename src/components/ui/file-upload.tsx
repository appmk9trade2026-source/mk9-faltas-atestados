import * as React from "react";
import { UploadCloud, X, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  loading?: boolean;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
  value?: string | null; // URL of existing file
  fileName?: string | null;
}

export function FileUpload({
  onFileSelect,
  loading,
  accept = ".pdf,.jpg,.jpeg,.png",
  maxSizeMB = 10,
  className,
  value,
  fileName
}: FileUploadProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      alert(`Arquivo muito grande. O limite é ${maxSizeMB}MB.`);
      return;
    }
    setSelectedFile(file);
    onFileSelect(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileSelect(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {!selectedFile && !value ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <input
            type="file"
            ref={inputRef}
            className="hidden"
            accept={accept}
            onChange={onFileChange}
          />
          <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Clique ou arraste a evidência aqui</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPG ou PNG (Max ${maxSizeMB}MB)</p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium truncate max-w-[200px]">
                {selectedFile?.name || fileName || "Arquivo selecionado"}
              </span>
              {selectedFile && (
                <span className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearFile}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
