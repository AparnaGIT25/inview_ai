'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation'; // <-- Import useRouter
import { toast } from 'sonner';
import { CheckCircle, Loader2 } from 'lucide-react';

interface UploadResumeDialogProps {
  userId: string;
}

export default function UploadResumeDialog({ userId }: UploadResumeDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  
  const router = useRouter(); // <-- Initialize router

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a resume file first.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('userid', userId); // <-- Use the actual passed ID

    try {
      setUploading(true);
      toast.info('Analyzing your resume, please wait...');

      const res = await fetch('/api/resume', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success('Interview questions generated successfully!');
        setOpen(false); // Close dialog first
        
        // Refresh the server data without a full page reload
        router.refresh(); 
      } else {
        toast.error(data.error || 'Failed to analyze resume.');
      }
    } catch (error) {
      toast.error('Something went wrong while uploading.');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDialogChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button className="relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50 max-sm:w-full">
          <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
          <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white backdrop-blur-3xl">
            Your Resume
          </span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Upload Your Resume</DialogTitle>
          <DialogDescription className="text-slate-400">
            We'll extract key details from your resume and generate relevant interview questions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mt-4">
          <input
            type="file"
            ref={inputRef}
            accept=".pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm border border-slate-800 rounded-lg p-2 bg-slate-900 text-slate-300 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-700"
            required
          />
          {file && <CheckCircle className="text-green-500 w-6 h-6 shrink-0" />}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button 
            variant="ghost" 
            className="text-slate-400 hover:text-white"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          
          <Button 
            disabled={uploading} 
            onClick={handleUpload}
            className="bg-indigo-600 hover:bg-indigo-700 min-w-[140px]"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Generate Interview'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}