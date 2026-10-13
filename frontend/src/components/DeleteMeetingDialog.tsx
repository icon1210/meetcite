import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Alert, Spinner } from "./ui/misc";

/** Confirms permanent deletion of a meeting and its recording (US9). */
export function DeleteMeetingDialog({
  meeting,
  onClose,
  onDeleted,
}: {
  meeting: { id: number; title: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: (id: number) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      onClose();
      onDeleted?.();
    },
  });

  return (
    <Dialog
      open={meeting !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Delete this meeting?"
      description={`"${meeting?.title}" — the recording, transcript and notes will be permanently deleted. This cannot be undone.`}
    >
      {del.isError && (
        <Alert variant="destructive" className="mb-3">
          {(del.error as Error).message}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={del.isPending} onClick={() => meeting && del.mutate(meeting.id)}>
          {del.isPending && <Spinner />} Delete permanently
        </Button>
      </div>
    </Dialog>
  );
}
