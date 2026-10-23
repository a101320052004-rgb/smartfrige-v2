/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark,
  Camera,
  CheckCircle2,
  ChefHat,
  Clock,
  Eye,
  Heart,
  Lock,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { SharedRecipe } from '../types';
import { ApiError, followsApi, recipesApi, type RecipeInput } from '../lib/api';
import { getChefTier } from '../lib/chefTier';

type CommunityTab = 'feed' | 'myrecipes' | 'saved' | 'following';

type Interaction = {
  liked: boolean;
  saved: boolean;
  likes: number;
};

type RecipeDraft = {
  name: string;
  description: string;
  ingredients: string;
  steps: string;
  tags: string;
  prepTime: string;
  image: string;
  isPublic: boolean;
};

const emptyDraft: RecipeDraft = {
  name: '',
  description: '',
  ingredients: '',
  steps: '',
  tags: '',
  prepTime: '',
  image: '',
  isPublic: false,
};

const fieldClassName =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[var(--theme-main)] focus:ring-2 focus:ring-[var(--theme-soft)] placeholder:text-slate-400';

const splitLines = (value: string) =>
  value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

const normalizeTags = (value: string) =>
  value
    .split(/[,\s，、]+/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => (tag.startsWith('#') ? tag : `#${tag}`))
    .slice(0, 8);

const interactionOf = (recipe: SharedRecipe): Interaction => ({
  liked: !!recipe.liked,
  saved: !!recipe.saved,
  likes: recipe.likes ?? 0,
});

const recipeToInput = (recipe: SharedRecipe, isPublic = !!recipe.isPublic): RecipeInput => ({
  name: recipe.name,
  description: recipe.description,
  fullContent: recipe.fullContent || recipe.description,
  image: recipe.image,
  prepTime: recipe.prepTime,
  tags: recipe.tags,
  ingredients: recipe.ingredients ?? [],
  steps: recipe.steps ?? [],
  isPublic,
  origin: recipe.origin ?? 'manual',
});

const validatePublicRecipe = (input: RecipeInput) => {
  if (!input.isPublic) return '';
  const missing = [];
  if (!input.image) missing.push('成品照片');
  if (!input.ingredients?.length) missing.push('食材');
  if (!input.steps?.length) missing.push('步驟');
  if (!input.prepTime || input.prepTime <= 0) missing.push('烹飪時間');
  return missing.length ? `公開分享前請補齊：${missing.join('、')}` : '';
};

export default function CommunityView() {
  const [recipes, setRecipes] = useState<SharedRecipe[]>([]);
  const [interactions, setInteractions] = useState<Record<string, Interaction>>({});
  const [followedChefIds, setFollowedChefIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [mySearchQuery, setMySearchQuery] = useState('');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [showSavedSearch, setShowSavedSearch] = useState(false);
  const [followingSearchQuery, setFollowingSearchQuery] = useState('');
  const [showFollowingSearch, setShowFollowingSearch] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft);
  const [detailRecipe, setDetailRecipe] = useState<SharedRecipe | null>(null);
  const [viewingAuthor, setViewingAuthor] = useState<SharedRecipe['author'] | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const syncRecipes = (items: SharedRecipe[]) => {
    setRecipes(items);
    setInteractions(Object.fromEntries(items.map(recipe => [recipe.id, interactionOf(recipe)])));
  };

  const loadCommunity = () => {
    setLoading(true);
    Promise.all([recipesApi.list(), followsApi.list()])
      .then(([recipeItems, followedIds]) => {
        syncRecipes(recipeItems);
        setFollowedChefIds(new Set(followedIds));
        setMessage('');
      })
      .catch(err => setMessage(err instanceof Error ? err.message : '讀取社群資料失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCommunity();
  }, []);

  const myRecipes = useMemo(() => recipes.filter(recipe => recipe.owner === 'me'), [recipes]);
  const feedRecipes = useMemo(() => recipes.filter(recipe => recipe.isPublic), [recipes]);
  const savedRecipes = useMemo(
    () => recipes.filter(recipe => interactions[recipe.id]?.saved),
    [interactions, recipes]
  );

  const filteredFeed = feedRecipes.filter(recipe => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      recipe.name.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(query))
    );
  });

  const filteredMyRecipes = useMemo(() => {
    const query = mySearchQuery.trim().toLowerCase();
    if (!query) return myRecipes;
    return myRecipes.filter(recipe =>
      recipe.name.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [myRecipes, mySearchQuery]);

  const filteredSavedRecipes = useMemo(() => {
    const query = savedSearchQuery.trim().toLowerCase();
    if (!query) return savedRecipes;
    return savedRecipes.filter(recipe =>
      recipe.name.toLowerCase().includes(query) ||
      recipe.description.toLowerCase().includes(query) ||
      recipe.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [savedRecipes, savedSearchQuery]);

  const myAuthorId = useMemo(() => myRecipes[0]?.author.id ?? null, [myRecipes]);

  const followedAuthors = useMemo(() => {
    const grouped = new Map<string, { author: SharedRecipe['author']; recipes: SharedRecipe[] }>();
    recipes
      .filter(recipe => followedChefIds.has(recipe.author.id))
      .forEach(recipe => {
        const existing = grouped.get(recipe.author.id);
        if (existing) existing.recipes.push(recipe);
        else grouped.set(recipe.author.id, { author: recipe.author, recipes: [recipe] });
      });
    return [...grouped.values()];
  }, [followedChefIds, recipes]);

  const filteredFollowedAuthors = useMemo(() => {
    const query = followingSearchQuery.trim().toLowerCase();
    if (!query) return followedAuthors;
    return followedAuthors.filter(group =>
      group.author.name.toLowerCase().includes(query) ||
      group.recipes.some(recipe => recipe.name.toLowerCase().includes(query))
    );
  }, [followedAuthors, followingSearchQuery]);

  const openCreateModal = () => {
    setEditingRecipeId(null);
    setDraft(emptyDraft);
    setMessage('');
    setShowShareModal(true);
  };

  const openEditRecipe = (recipe: SharedRecipe) => {
    setEditingRecipeId(recipe.id);
    setDraft({
      name: recipe.name,
      description: recipe.description ?? '',
      ingredients: (recipe.ingredients ?? []).join('\n'),
      steps: (recipe.steps ?? []).join('\n'),
      tags: recipe.tags.join(' '),
      prepTime: recipe.prepTime ? String(recipe.prepTime) : '',
      image: recipe.image ?? '',
      isPublic: !!recipe.isPublic,
    });
    setMessage('');
    setShowShareModal(true);
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setEditingRecipeId(null);
    setDraft(emptyDraft);
  };

  const draftToInput = (): RecipeInput => {
    const ingredients = splitLines(draft.ingredients);
    const steps = splitLines(draft.steps);
    const description = draft.description.trim() || steps[0] || ingredients[0] || '';
    return {
      name: draft.name.trim(),
      description,
      fullContent: steps.length ? steps.join(' ') : description,
      image: draft.image,
      prepTime: Number(draft.prepTime) || 0,
      tags: normalizeTags(draft.tags),
      ingredients,
      steps,
      isPublic: draft.isPublic,
      origin: 'manual',
    };
  };

  const saveRecipe = () => {
    if (!draft.name.trim()) return;
    const input = draftToInput();
    const validation = validatePublicRecipe(input);
    if (validation) {
      setMessage(validation);
      return;
    }

    setIsSubmitting(true);
    const action = editingRecipeId ? recipesApi.update(editingRecipeId, input) : recipesApi.create(input);
    action
      .then(saved => {
        setRecipes(prev => (
          editingRecipeId
            ? prev.map(recipe => (recipe.id === saved.id ? saved : recipe))
            : [saved, ...prev]
        ));
        setInteractions(prev => ({ ...prev, [saved.id]: interactionOf(saved) }));
        closeShareModal();
        setActiveTab('myrecipes');
        setMessage('');
      })
      .catch(err => setMessage(err instanceof ApiError ? err.message : '儲存食譜失敗'))
      .finally(() => setIsSubmitting(false));
  };

  const togglePublic = (recipe: SharedRecipe) => {
    const input = recipeToInput(recipe, !recipe.isPublic);
    const validation = validatePublicRecipe(input);
    if (validation) {
      setMessage(validation);
      return;
    }
    recipesApi.update(recipe.id, input)
      .then(updated => {
        setRecipes(prev => prev.map(item => (item.id === updated.id ? updated : item)));
        setMessage('');
      })
      .catch(err => setMessage(err instanceof ApiError ? err.message : '更新公開狀態失敗'));
  };

  const removeRecipe = (recipe: SharedRecipe) => {
    if (!window.confirm(`確定要刪除「${recipe.name}」嗎？此操作無法復原。`)) return;
    setRecipes(prev => prev.filter(item => item.id !== recipe.id));
    recipesApi.remove(recipe.id)
      .then(() => {
        setInteractions(prev => {
          const next = { ...prev };
          delete next[recipe.id];
          return next;
        });
      })
      .catch(err => {
        setRecipes(prev => [recipe, ...prev]);
        setMessage(err instanceof Error ? err.message : '刪除食譜失敗');
      });
  };

  const updateRecipePhoto = (recipe: SharedRecipe, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : '';
      if (!image) return;
      const updatedRecipe = { ...recipe, image };
      setRecipes(prev => prev.map(item => (item.id === recipe.id ? updatedRecipe : item)));
      recipesApi.update(recipe.id, recipeToInput(updatedRecipe))
        .then(saved => setRecipes(prev => prev.map(item => (item.id === saved.id ? saved : item))))
        .catch(err => setMessage(err instanceof Error ? err.message : '更新照片失敗'));
    };
    reader.readAsDataURL(file);
  };

  const toggleLike = (recipe: SharedRecipe) => {
    const current = interactions[recipe.id] || interactionOf(recipe);
    const optimistic = {
      ...current,
      liked: !current.liked,
      likes: current.liked ? Math.max(0, current.likes - 1) : current.likes + 1,
    };
    setInteractions(prev => ({ ...prev, [recipe.id]: optimistic }));
    recipesApi.toggleLike(recipe.id)
      .then(stats => {
        setInteractions(prev => ({ ...prev, [recipe.id]: stats }));
        setRecipes(prev => prev.map(item => (item.id === recipe.id ? { ...item, ...stats } : item)));
      })
      .catch(err => {
        setInteractions(prev => ({ ...prev, [recipe.id]: current }));
        setMessage(err instanceof Error ? err.message : '更新按讚失敗');
      });
  };

  const toggleSave = (recipe: SharedRecipe) => {
    const current = interactions[recipe.id] || interactionOf(recipe);
    setInteractions(prev => ({ ...prev, [recipe.id]: { ...current, saved: !current.saved } }));
    recipesApi.toggleSave(recipe.id)
      .then(stats => {
        setInteractions(prev => ({ ...prev, [recipe.id]: stats }));
        setRecipes(prev => prev.map(item => (item.id === recipe.id ? { ...item, ...stats } : item)));
      })
      .catch(err => {
        setInteractions(prev => ({ ...prev, [recipe.id]: current }));
        setMessage(err instanceof Error ? err.message : '更新收藏失敗');
      });
  };

  const toggleFollow = (authorId: string) => {
    if (authorId === myAuthorId) return;
    const nextFollowing = !followedChefIds.has(authorId);
    setFollowedChefIds(prev => {
      const next = new Set(prev);
      if (nextFollowing) next.add(authorId);
      else next.delete(authorId);
      return next;
    });
    const action = nextFollowing ? followsApi.follow(authorId) : followsApi.unfollow(authorId);
    action
      .then(ids => setFollowedChefIds(new Set(ids)))
      .catch(err => {
        setMessage(err instanceof Error ? err.message : '更新追蹤失敗');
        setFollowedChefIds(prev => {
          const next = new Set(prev);
          if (nextFollowing) next.delete(authorId);
          else next.add(authorId);
          return next;
        });
      });
  };

  const renderRecipes = (items: SharedRecipe[], emptyText: string) => {
    if (loading) {
      return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">讀取中...</div>;
    }
    if (items.length === 0) {
      return <EmptyState title={emptyText} onAction={openCreateModal} />;
    }
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {items.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              interaction={interactions[recipe.id] || interactionOf(recipe)}
              isFollowing={followedChefIds.has(recipe.author.id)}
              onDetail={() => setDetailRecipe(recipe)}
              onEdit={() => openEditRecipe(recipe)}
              onDelete={() => removeRecipe(recipe)}
              onLike={() => toggleLike(recipe)}
              onSave={() => toggleSave(recipe)}
              onTogglePublic={() => togglePublic(recipe)}
              onViewAuthor={() => setViewingAuthor(recipe.author)}
              onToggleFollow={() => toggleFollow(recipe.author.id)}
              onPhotoUpload={file => updateRecipePhoto(recipe, file)}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-[var(--theme-text)]" />
            <h2 className="text-3xl font-extrabold tracking-tight text-[var(--theme-text)] md:text-4xl">主廚食譜社群</h2>
          </div>
          <p className="text-sm text-slate-500">分享料理、收藏靈感，並追蹤喜歡的主廚。</p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--theme-dark)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-[var(--theme-main)]"
        >
          <Upload className="h-4 w-4" />
          建立食譜
        </button>
      </div>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { id: 'feed', label: '社群食譜', count: filteredFeed.length, icon: Users },
            { id: 'myrecipes', label: '我的食譜', count: myRecipes.length, icon: Camera },
            { id: 'saved', label: '我的收藏', count: savedRecipes.length, icon: Bookmark },
            { id: 'following', label: '追蹤主廚', count: followedChefIds.size, icon: Heart },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as CommunityTab)}
                className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${
                  active ? 'bg-[var(--theme-dark)] text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-white/20' : 'bg-white'}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'feed' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="搜尋食譜、標籤或描述..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-[var(--theme-main)] focus:ring-2 focus:ring-[var(--theme-soft)]"
            />
          </div>
          {renderRecipes(filteredFeed, '目前還沒有公開食譜')}
        </div>
      )}

      {activeTab === 'myrecipes' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={mySearchQuery}
              onChange={event => setMySearchQuery(event.target.value)}
              placeholder="搜尋我的食譜..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-[var(--theme-main)] focus:ring-2 focus:ring-[var(--theme-soft)]"
            />
          </div>
          {renderRecipes(filteredMyRecipes, '快來分享你的第一道食譜！')}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="space-y-4">
          <SearchBar
            show={showSavedSearch}
            onToggle={() => { setShowSavedSearch(v => !v); setSavedSearchQuery(''); }}
            value={savedSearchQuery}
            onChange={setSavedSearchQuery}
            placeholder="搜尋收藏食譜、標籤..."
          />
          {renderRecipes(filteredSavedRecipes, '目前沒有收藏食譜')}
        </div>
      )}

      {activeTab === 'following' && (
        <div className="space-y-4">
          <SearchBar
            show={showFollowingSearch}
            onToggle={() => { setShowFollowingSearch(v => !v); setFollowingSearchQuery(''); }}
            value={followingSearchQuery}
            onChange={setFollowingSearchQuery}
            placeholder="搜尋主廚名稱或食譜..."
          />
          {filteredFollowedAuthors.length === 0 && followedAuthors.length === 0 ? (
          <EmptyState title="目前沒有追蹤主廚" onAction={() => setActiveTab('feed')} actionLabel="去社群看看" />
        ) : filteredFollowedAuthors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">沒有符合的主廚或食譜</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {filteredFollowedAuthors.map(group => (
              <div key={group.author.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">{group.author.name}</h3>
                    <p className="text-xs font-semibold text-slate-500">{group.recipes.length} 道公開食譜</p>
                  </div>
                  <button
                    onClick={() => toggleFollow(group.author.id)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-500"
                  >
                    取消追蹤
                  </button>
                </div>
                <div className="grid gap-2">
                  {group.recipes.map(recipe => (
                    <button
                      key={recipe.id}
                      onClick={() => setDetailRecipe(recipe)}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-left hover:bg-[var(--theme-tint)]"
                    >
                      {recipe.image ? (
                        <img src={recipe.image} alt={recipe.name} className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-slate-300">
                          <Camera className="h-5 w-5" />
                        </div>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{recipe.name}</span>
                        <span className="text-xs font-semibold text-slate-500">{recipe.prepTime || 0} 分鐘</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      )}

      {showShareModal && (
        <ShareRecipeModal
          draft={draft}
          isEditing={!!editingRecipeId}
          isSubmitting={isSubmitting}
          message={message}
          onClose={closeShareModal}
          onDraftChange={(key, value) => setDraft(prev => ({ ...prev, [key]: value }))}
          onSave={saveRecipe}
        />
      )}

      {detailRecipe && (
        <RecipeDetailModal
          recipe={detailRecipe}
          interaction={interactions[detailRecipe.id] || interactionOf(detailRecipe)}
          onClose={() => setDetailRecipe(null)}
          onLike={() => toggleLike(detailRecipe)}
          onSave={() => toggleSave(detailRecipe)}
          onViewAuthor={() => setViewingAuthor(detailRecipe.author)}
        />
      )}

      {viewingAuthor && (
        <AuthorModal
          author={viewingAuthor}
          recipes={recipes.filter(recipe => recipe.author.id === viewingAuthor.id && recipe.isPublic)}
          isFollowing={followedChefIds.has(viewingAuthor.id)}
          onToggleFollow={() => toggleFollow(viewingAuthor.id)}
          onSelectRecipe={recipe => {
            setViewingAuthor(null);
            setDetailRecipe(recipe);
          }}
          onClose={() => setViewingAuthor(null)}
        />
      )}
    </div>
  );
}

function EmptyState({
  title,
  actionLabel = '建立食譜',
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--theme-tint)] text-[var(--theme-text)]">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <button
        onClick={onAction}
        className="mt-5 rounded-xl bg-[var(--theme-dark)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--theme-main)]"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function RecipeCard({
  recipe,
  interaction,
  isFollowing,
  onDetail,
  onEdit,
  onDelete,
  onLike,
  onSave,
  onTogglePublic,
  onViewAuthor,
  onToggleFollow,
  onPhotoUpload,
}: {
  recipe: SharedRecipe;
  interaction: Interaction;
  isFollowing: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLike: () => void;
  onSave: () => void;
  onTogglePublic: () => void;
  onViewAuthor: () => void;
  onToggleFollow: () => void;
  onPhotoUpload: (file: File | undefined) => void;
  key?: React.Key;
}) {
  const isMine = recipe.owner === 'me';
  const tier = getChefTier(recipe.author.recipeCount ?? 0);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--theme-tint)]">
        <button onClick={onDetail} className="block h-full w-full text-left" aria-label={`查看 ${recipe.name}`}>
          {recipe.image ? (
            <img src={recipe.image} alt={recipe.name} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--theme-text)]/50">
              <Camera className="h-8 w-8" />
              <span className="text-xs font-bold">尚未上傳照片</span>
            </div>
          )}
        </button>

        {isMine ? (
          <div className="absolute right-3 top-3 flex gap-2">
            <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[var(--theme-text)] shadow">
              {recipe.isPublic ? '公開中' : '私密草稿'}
            </span>
          </div>
        ) : (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
            <button
              onClick={event => {
                event.stopPropagation();
                onViewAuthor();
              }}
              className="flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-2 shadow transition-colors hover:bg-white"
            >
              <p className="text-xs font-bold text-slate-900">{recipe.author.name}</p>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tier.className}`}>{tier.label}</span>
            </button>
            <button
              onClick={event => {
                event.stopPropagation();
                onToggleFollow();
              }}
              className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold shadow transition-colors ${
                isFollowing ? 'bg-[var(--theme-dark)] text-white hover:bg-rose-500' : 'bg-white/92 text-slate-700 hover:bg-white'
              }`}
            >
              {isFollowing ? '已追蹤' : '+ 追蹤'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {(recipe.tags.length ? recipe.tags : ['#家常菜']).slice(0, 3).map(tag => (
            <span key={tag} className="rounded-full bg-[var(--theme-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--theme-text)]">
              {tag}
            </span>
          ))}
        </div>

        <div>
          <h3 className="line-clamp-2 text-base font-bold text-slate-900">{recipe.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {recipe.prepTime || 0} 分鐘
            </span>
          </div>
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{recipe.description || '尚未填寫描述'}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onLike}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                interaction.liked ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${interaction.liked ? 'fill-current' : ''}`} />
              {interaction.likes}
            </button>
            <button onClick={onDetail} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
              <Eye className="h-3.5 w-3.5" />
              詳情
            </button>
          </div>

          <div className="flex items-center gap-1">
            {isMine ? (
              <>
                <label className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-[var(--theme-text)]">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={event => onPhotoUpload(event.target.files?.[0])} />
                </label>
                <button onClick={onEdit} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-[var(--theme-text)]">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={onTogglePublic} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-[var(--theme-text)]">
                  {recipe.isPublic ? <Eye className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </button>
                <button onClick={onDelete} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={onSave}
                className={`rounded-full p-2 transition-colors ${
                  interaction.saved ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${interaction.saved ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ShareRecipeModal({
  draft,
  isEditing,
  isSubmitting,
  message,
  onClose,
  onDraftChange,
  onSave,
}: {
  draft: RecipeDraft;
  isEditing: boolean;
  isSubmitting: boolean;
  message: string;
  onClose: () => void;
  onDraftChange: (key: keyof RecipeDraft, value: string | boolean) => void;
  onSave: () => void;
}) {
  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onDraftChange('image', reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-5">
      <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="關閉建立食譜視窗" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900">{isEditing ? '編輯食譜' : '建立食譜'}</h3>
            <p className="mt-1 text-sm text-slate-500">私密草稿可先儲存；公開分享前需補齊照片、食材、步驟與時間。</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-50 p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-slate-400">標有 <span className="text-rose-400">*</span> 的欄位為公開分享時必填</p>
          <Field label="成品照片 *">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
              {draft.image ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img src={draft.image} alt="成品照片預覽" className="h-48 w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-44 flex-col items-center justify-center rounded-xl bg-white text-center">
                  <Camera className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-600">尚未上傳成品照片</p>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--theme-dark)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--theme-main)]">
                  <Camera className="h-4 w-4" />
                  拍照或上傳
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="sr-only" />
                </label>
                {draft.image && (
                  <button
                    type="button"
                    onClick={() => onDraftChange('image', '')}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    移除照片
                  </button>
                )}
              </div>
            </div>
          </Field>

          <Field label="食譜名稱">
            <input value={draft.name} onChange={event => onDraftChange('name', event.target.value)} placeholder="例如：番茄起司義大利麵" className={fieldClassName} />
          </Field>

          <Field label="描述">
            <textarea value={draft.description} onChange={event => onDraftChange('description', event.target.value)} rows={2} placeholder="簡短描述這道料理" className={`${fieldClassName} resize-none`} />
          </Field>

          <Field label="烹飪時間（分鐘） *">
            <input value={draft.prepTime} onChange={event => onDraftChange('prepTime', event.target.value)} placeholder="15" className={fieldClassName} inputMode="numeric" />
          </Field>

          <Field label="標籤（最多 8 個，空格或逗號分隔）">
            <input value={draft.tags} onChange={event => onDraftChange('tags', event.target.value)} placeholder="快手菜 高蛋白 晚餐" className={fieldClassName} />
          </Field>

          <Field label="食材 *">
            <textarea value={draft.ingredients} onChange={event => onDraftChange('ingredients', event.target.value)} rows={4} placeholder={'每行一項，例如：\n牛排 800g\n羽衣甘藍 1 把'} className={`${fieldClassName} resize-none`} />
          </Field>

          <Field label="步驟 *">
            <textarea value={draft.steps} onChange={event => onDraftChange('steps', event.target.value)} rows={4} placeholder={'每行一個步驟，例如：\n熱鍋煎香牛排\n拌入沙拉蔬菜'} className={`${fieldClassName} resize-none`} />
          </Field>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-sm font-extrabold text-slate-800">公開分享到社群</span>
              <span className="text-xs font-semibold text-slate-500">關閉時會先存成私密草稿</span>
            </span>
            <input type="checkbox" checked={draft.isPublic} onChange={event => onDraftChange('isPublic', event.target.checked)} className="h-5 w-5 accent-[var(--theme-main)]" />
          </label>
        </div>

        <div className="sticky bottom-0 -mx-5 mt-5 border-t border-slate-100 bg-white/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur md:-mx-6 md:px-6">
          {message && (
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-700">
              {message}
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!draft.name.trim() || isSubmitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--theme-dark)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--theme-main)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {isEditing ? '儲存變更' : '儲存食譜'}
          </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RecipeDetailModal({
  recipe,
  interaction,
  onClose,
  onLike,
  onSave,
  onViewAuthor,
}: {
  recipe: SharedRecipe;
  interaction: Interaction;
  onClose: () => void;
  onLike: () => void;
  onSave: () => void;
  onViewAuthor: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-5">
      <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="關閉食譜詳情" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:max-w-4xl md:rounded-3xl"
      >
        <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
          <div className="relative min-h-72 bg-[var(--theme-tint)]">
            {recipe.image ? (
              <img src={recipe.image} alt={recipe.name} className="h-full min-h-72 w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-72 w-full flex-col items-center justify-center gap-2 text-[var(--theme-text)]/50">
                <Camera className="h-10 w-10" />
                <span className="text-sm font-bold">尚未上傳照片</span>
              </div>
            )}
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-500 shadow hover:text-slate-900">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 p-5 md:p-6">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                {recipe.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-[var(--theme-tint)] px-3 py-1 text-xs font-bold text-[var(--theme-text)]">{tag}</span>
                ))}
              </div>
              <h3 className="text-2xl font-extrabold leading-tight text-slate-900">{recipe.name}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{recipe.prepTime || 0} 分鐘</span>
              </div>
            </div>

            <button onClick={onViewAuthor} className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left transition-colors hover:bg-[var(--theme-tint)]">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{recipe.author.name}</p>
                <p className="text-xs font-semibold text-slate-500">{recipe.createdAt} 分享</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-[var(--theme-text)]">查看主頁</span>
            </button>

            <p className="text-sm leading-7 text-slate-600">{recipe.fullContent || recipe.description}</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoList title="需要食材" items={recipe.ingredients ?? []} />
              <InfoList title="料理步驟" items={recipe.steps ?? []} ordered />
            </div>

            <div className="flex gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={onLike}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${
                  interaction.liked ? 'bg-[var(--theme-tint)] text-[var(--theme-text)]' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Heart className={`mr-2 inline h-4 w-4 ${interaction.liked ? 'fill-current' : ''}`} />
                {interaction.likes}
              </button>
              {recipe.owner !== 'me' && (
                <button
                  onClick={onSave}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold ${
                    interaction.saved ? 'bg-[var(--theme-dark)] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Bookmark className={`mr-2 inline h-4 w-4 ${interaction.saved ? 'fill-current' : ''}`} />
                  {interaction.saved ? '已收藏' : '收藏食譜'}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function InfoList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <h4 className="mb-3 text-sm font-bold text-slate-900">{title}</h4>
      <ul className="space-y-2 text-sm text-slate-600">
        {(items.length ? items : ['尚未填寫']).map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2">
            {ordered ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--theme-tint)] text-[11px] font-bold text-[var(--theme-text)]">{index + 1}</span>
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-text)]" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuthorModal({
  author,
  recipes,
  isFollowing,
  onToggleFollow,
  onSelectRecipe,
  onClose,
}: {
  author: SharedRecipe['author'];
  recipes: SharedRecipe[];
  isFollowing: boolean;
  onToggleFollow: () => void;
  onSelectRecipe: (recipe: SharedRecipe) => void;
  onClose: () => void;
}) {
  const tier = getChefTier(author.recipeCount ?? recipes.length);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 md:items-center md:p-5">
      <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={onClose} aria-label="關閉主廚主頁" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl md:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-extrabold text-slate-900">{author.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tier.className}`}>{tier.label}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">累積公開分享 {author.recipeCount ?? recipes.length} 道食譜</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFollow}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                isFollowing ? 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-500' : 'bg-[var(--theme-dark)] text-white hover:bg-[var(--theme-main)]'
              }`}
            >
              {isFollowing ? '取消追蹤' : '+ 追蹤主廚'}
            </button>
            <button onClick={onClose} className="rounded-full bg-slate-50 p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recipes.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => onSelectRecipe(recipe)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-colors hover:bg-[var(--theme-tint)]"
            >
              {recipe.image ? (
                <img src={recipe.image} alt={recipe.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
                  <Camera className="h-5 w-5" />
                </div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{recipe.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <Clock className="h-3 w-3" />
                  {recipe.prepTime || 0} 分鐘
                </span>
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function SearchBar({
  show,
  onToggle,
  value,
  onChange,
  placeholder,
}: {
  show: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          {show ? '收起搜尋' : '搜尋 / 篩選'}
        </span>
        <motion.span
          animate={{ rotate: show ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400"
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            key="search-bar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="relative px-4 py-3">
              <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-semibold text-slate-800 outline-none transition focus:border-[var(--theme-main)] focus:ring-2 focus:ring-[var(--theme-soft)]"
              />
              {value && (
                <button
                  onClick={() => onChange('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
