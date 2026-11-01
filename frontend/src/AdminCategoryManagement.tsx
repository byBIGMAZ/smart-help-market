
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import {
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  setAdminCategoryStatus,
  type AdminCategory,
} from './services/adminCategories'

import './AdminCategoryManagement.css'

interface Props {
  onNotice: (message: string) => void
}

interface CategoryForm {
  name: string
  description: string
  displayOrder: string
}

const EMPTY_FORM: CategoryForm = {
  name: '',
  description: '',
  displayOrder: '1',
}

function AdminCategoryManagement({ onNotice }: Props) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<AdminCategory | null>(null)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const [statusTarget, setStatusTarget] =
    useState<AdminCategory | null>(null)

  async function loadCategories() {
    setLoading(true)
    setError('')

    try {
      const result = await getAdminCategories()
      setCategories(result.categories)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load marketplace categories.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()

    return categories.filter((category) => {
      const matchesSearch =
        !query ||
        category.name.toLowerCase().includes(query) ||
        category.key.toLowerCase().includes(query) ||
        category.description.toLowerCase().includes(query)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && category.isActive) ||
        (statusFilter === 'inactive' && !category.isActive)

      return matchesSearch && matchesStatus
    })
  }, [categories, search, statusFilter])

  const summary = useMemo(
    () => ({
      total: categories.length,
      active: categories.filter((item) => item.isActive).length,
      inactive: categories.filter((item) => !item.isActive).length,
      listings: categories.reduce(
        (sum, item) => sum + item.totalListings,
        0,
      ),
    }),
    [categories],
  )

  function openCreateForm() {
    setEditingCategory(null)
    setForm({
      ...EMPTY_FORM,
      displayOrder: String(categories.length + 1),
    })
    setFormError('')
    setFormOpen(true)
  }

  function openEditForm(category: AdminCategory) {
    setEditingCategory(category)
    setForm({
      name: category.name,
      description: category.description,
      displayOrder: String(category.displayOrder),
    })
    setFormError('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditingCategory(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim()
    const description = form.description.trim()
    const displayOrder = Number(form.displayOrder)

    if (!name) {
      setFormError('Enter a category name.')
      return
    }

    if (name.length > 100 || description.length > 500) {
      setFormError('Check the maximum allowed field lengths.')
      return
    }

    if (
      !Number.isInteger(displayOrder) ||
      displayOrder < 0 ||
      displayOrder > 100000
    ) {
      setFormError('Display order must be a whole number from 0 to 100000.')
      return
    }

    setSaving(true)
    setFormError('')
    setError('')

    try {
      const input = { name, description, displayOrder }

      const result = editingCategory
        ? await updateAdminCategory(editingCategory.id, input)
        : await createAdminCategory(input)

      setFormOpen(false)
      setEditingCategory(null)
      setForm(EMPTY_FORM)
      onNotice(result.message)
      await loadCategories()
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'The category could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function confirmStatusChange() {
    if (!statusTarget || saving) return

    const category = statusTarget
    const nextStatus = !category.isActive

    setSaving(true)
    setError('')

    try {
      const result = await setAdminCategoryStatus(
        category.id,
        nextStatus,
      )

      setStatusTarget(null)
      onNotice(result.message)
      await loadCategories()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Category status could not be changed.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-category-section">
      <div className="admin-section-heading">
        <div>
          <span className="admin-kicker">MARKETPLACE CONFIGURATION</span>
          <h2>Category Management</h2>
          <p className="admin-users-description">
            Organise marketplace categories and control which ones are
            available to the public.
          </p>
        </div>

        <button
          type="button"
          className="admin-primary-button"
          onClick={openCreateForm}
          disabled={loading}
        >
          + Create category
        </button>
      </div>

      {error && (
        <div className="admin-message admin-error" role="alert">
          {error}
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => void loadCategories()}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}

      <div className="admin-category-summary">
        <article className="admin-category-stat">
          <span>Total categories</span>
          <strong>{loading ? '—' : summary.total}</strong>
        </article>

        <article className="admin-category-stat">
          <span>Active categories</span>
          <strong>{loading ? '—' : summary.active}</strong>
        </article>

        <article className="admin-category-stat">
          <span>Inactive categories</span>
          <strong>{loading ? '—' : summary.inactive}</strong>
        </article>

        <article className="admin-category-stat">
          <span>Listings assigned</span>
          <strong>{loading ? '—' : summary.listings}</strong>
        </article>
      </div>

      <div className="admin-category-toolbar">
        <label className="admin-category-search">
          <span>Search categories</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, key or description"
            maxLength={100}
          />
        </label>

        <label className="admin-category-status-filter">
          <span>Category status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as 'all' | 'active' | 'inactive',
              )
            }
          >
            <option value="all">All categories</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </label>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => void loadCategories()}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className="admin-empty-panel">
          Loading marketplace categories…
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="admin-empty-panel admin-category-empty">
          <h3>No categories found</h3>
          <p>Try another search or create a new category.</p>
          {categories.length === 0 && (
            <button
              type="button"
              className="admin-primary-button"
              onClick={openCreateForm}
            >
              Create first category
            </button>
          )}
        </div>
      ) : (
        <div className="admin-category-table-wrap">
          <table className="admin-category-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Display order</th>
                <th>Listings</th>
                <th>Published</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <div className="admin-category-identity">
                      <strong>{category.name}</strong>
                      <code>{category.key}</code>
                      <small>
                        {category.description || 'No description'}
                      </small>
                    </div>
                  </td>

                  <td>{category.displayOrder}</td>
                  <td>{category.totalListings.toLocaleString()}</td>
                  <td>{category.publishedListings.toLocaleString()}</td>

                  <td>
                    <span
                      className={`admin-category-status ${
                        category.isActive ? 'is-active' : 'is-inactive'
                      }`}
                    >
                      {category.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td>
                    <div className="admin-category-actions">
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => openEditForm(category)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className={
                          category.isActive
                            ? 'admin-category-deactivate'
                            : 'admin-category-activate'
                        }
                        onClick={() => setStatusTarget(category)}
                        disabled={saving}
                      >
                        {category.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-category-note">
        <span aria-hidden="true">ℹ</span>
        <p>
          Category keys are permanent identifiers. Editing a category will
          not change its key or disconnect its existing listings. Deactivated
          categories are hidden from the public marketplace, but their
          existing listing records are preserved.
        </p>
      </div>

      {formOpen && (
        <div className="admin-category-backdrop">
          <section
            className="admin-category-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-category-form-title"
          >
            <div className="admin-category-dialog-heading">
              <div>
                <span className="admin-kicker">CATEGORY CONFIGURATION</span>
                <h3 id="admin-category-form-title">
                  {editingCategory ? 'Edit category' : 'Create category'}
                </h3>
              </div>

              <button
                type="button"
                className="admin-secondary-button"
                onClick={closeForm}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitCategory}>
              <label className="admin-category-form-field">
                <span>Category name *</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Education"
                  maxLength={100}
                  required
                  autoFocus
                  disabled={saving}
                />
              </label>

              <label className="admin-category-form-field">
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Briefly describe this category"
                  rows={4}
                  maxLength={500}
                  disabled={saving}
                />
                <small>{form.description.length}/500 characters</small>
              </label>

              <label className="admin-category-form-field">
                <span>Display order *</span>
                <input
                  type="number"
                  value={form.displayOrder}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayOrder: event.target.value,
                    }))
                  }
                  min={0}
                  max={100000}
                  step={1}
                  required
                  disabled={saving}
                />
                <small>Lower numbers appear first.</small>
              </label>

              {formError && (
                <div className="admin-message admin-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="admin-category-dialog-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="admin-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : editingCategory
                      ? 'Save changes'
                      : 'Create category'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {statusTarget && (
        <div className="admin-category-backdrop">
          <section
            className="admin-category-dialog admin-category-status-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-category-status-title"
          >
            <span className="admin-kicker">CONFIRM CATEGORY STATUS</span>
            <h3 id="admin-category-status-title">
              {statusTarget.isActive
                ? 'Deactivate category?'
                : 'Activate category?'}
            </h3>

            <p>
              You are about to{' '}
              {statusTarget.isActive ? 'deactivate' : 'activate'}{' '}
              <strong>{statusTarget.name}</strong>.
            </p>

            {statusTarget.isActive && (
              <p className="admin-category-warning">
                This category will disappear from the public marketplace.
                Existing listings will remain stored but will not appear
                through the public listing feed while the category is
                inactive.
              </p>
            )}

            <div className="admin-category-dialog-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setStatusTarget(null)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  statusTarget.isActive
                    ? 'admin-category-confirm-danger'
                    : 'admin-primary-button'
                }
                onClick={() => void confirmStatusChange()}
                disabled={saving}
              >
                {saving
                  ? 'Processing…'
                  : statusTarget.isActive
                    ? 'Deactivate category'
                    : 'Activate category'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default AdminCategoryManagement
