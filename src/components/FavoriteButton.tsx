import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type EntityType = "video" | "custom_playlist" | "channel_playlist";

type FavoriteButtonProps = {
  entityType: EntityType;
  entityId: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "ghost" | "outline";
  className?: string;
  showLabel?: boolean;
};

export function FavoriteButton({
  entityType,
  entityId,
  size = "icon",
  variant = "ghost",
  className,
  showLabel = false,
}: FavoriteButtonProps): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["favorites", "isFavorite", entityType, entityId],
    queryFn: () => trpcClient.favorites.isFavorite.query({ entityType, entityId }),
    staleTime: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: () => trpcClient.favorites.toggle.mutate({ entityType, entityId }),
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ["favorites", "isFavorite", entityType, entityId],
      });

      // Snapshot the previous value
      const previousValue = queryClient.getQueryData([
        "favorites",
        "isFavorite",
        entityType,
        entityId,
      ]);

      // Optimistically update
      queryClient.setQueryData(["favorites", "isFavorite", entityType, entityId], {
        isFavorite: !data?.isFavorite,
      });

      return { previousValue };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousValue) {
        queryClient.setQueryData(
          ["favorites", "isFavorite", entityType, entityId],
          context.previousValue
        );
      }
      toast.error("Failed to update favorite");
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.isFavorite ? "Added to favorites" : "Removed from favorites");
        // Invalidate the favorites list
        queryClient.invalidateQueries({ queryKey: ["favorites", "listAll"] });
      }
    },
    onSettled: () => {
      // Always refetch after mutation settles
      queryClient.invalidateQueries({
        queryKey: ["favorites", "isFavorite", entityType, entityId],
      });
    },
  });

  const isFavorite = data?.isFavorite ?? false;

  const handleClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    toggleMutation.mutate();
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isLoading || toggleMutation.isPending}
      className={cn(
        "transition-colors",
        isFavorite && "text-red-500 hover:text-red-600",
        className
      )}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart className={cn("h-4 w-4", isFavorite && "fill-current", size === "lg" && "h-5 w-5")} />
      {showLabel && <span className="ml-2">{isFavorite ? "Favorited" : "Favorite"}</span>}
    </Button>
  );
}
