"use client";

import { fetchWithAuth } from "@/lib/client-fetch";

import { useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/hooks/use-library";
import {
  User,
  Mail,
  MapPin,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  BookOpen,
  Smartphone,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface FormData {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  preferredBranch: string;
  cardType: "adult" | "juvenile" | "educator";
  parentName?: string;
  parentPhone?: string;
  agreeToTerms: boolean;
  emailOptIn: boolean;
}

const initialFormData: FormData = {
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  preferredBranch: "",
  cardType: "adult",
  agreeToTerms: false,
  emailOptIn: true,
};

export default function RegisterPage() {
  const t = useTranslations("registerPage");
  const { library } = useLibrary();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tempCardNumber, setTempCardNumber] = useState<string | null>(null);

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateStep = (stepNum: number): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (stepNum === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
      if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
      if (!formData.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";
      
      // Calculate age
      const dob = new Date(formData.dateOfBirth);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 0 || age > 120) newErrors.dateOfBirth = "Please enter a valid date of birth";
      
      // Auto-set card type based on age
      if (age < 18) {
        setFormData((prev) => ({ ...prev, cardType: "juvenile" }));
      }
    }

    if (stepNum === 2) {
      if (!formData.streetAddress.trim()) newErrors.streetAddress = "Street address is required";
      if (!formData.city.trim()) newErrors.city = "City is required";
      if (!formData.state.trim()) newErrors.state = "State is required";
      if (!formData.zipCode.trim()) newErrors.zipCode = "ZIP code is required";
      if (!/^\d{5}(-\d{4})?$/.test(formData.zipCode)) newErrors.zipCode = "Invalid ZIP code format";
    }

    if (stepNum === 3) {
      if (!formData.email.trim()) newErrors.email = "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email format";
      if (!formData.preferredBranch) newErrors.preferredBranch = "Please select a preferred branch";
      
      if (formData.cardType === "juvenile") {
        if (!formData.parentName?.trim()) newErrors.parentName = "Parent/guardian name is required";
        if (!formData.parentPhone?.trim()) newErrors.parentPhone = "Parent/guardian phone is required";
      }
      
      if (!formData.agreeToTerms) newErrors.agreeToTerms = "You must agree to the terms";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetchWithAuth("/api/opac/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setSuccess(true);
      setTempCardNumber(data.tempCardNumber);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Registration Complete!
          </h1>
          <p className="text-muted-foreground mb-6">
            Your library card application has been submitted. You can start using 
            your temporary card number immediately for digital resources.
          </p>
          
          {tempCardNumber && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 mb-6">
              <p className="text-sm text-primary-700 mb-2">Your Temporary Card Number</p>
              <p className="text-2xl font-mono font-bold text-primary-900">{tempCardNumber}</p>
              <p className="text-xs text-primary-600 mt-2">
                Visit any branch with your ID to receive your permanent card.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/opac/login"
              className="block w-full px-6 py-3 bg-primary-600 text-white rounded-lg font-medium
                       hover:bg-primary-700 transition-colors"
            >
              Log In to Your Account
            </Link>
            <Link
              href="/opac"
              className="block w-full px-6 py-3 border border-border text-foreground/80 rounded-lg font-medium
                       hover:bg-muted/30 transition-colors"
            >
              Return to Catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
            <CreditCard className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Get a Library Card
          </h1>
          <p className="text-muted-foreground">
            Free for all residents! Access books, eBooks, movies, and more.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-xl p-4 text-center border border-border">
            <BookOpen className="h-6 w-6 text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Unlimited Books</p>
          </div>
          <div className="bg-card rounded-xl p-4 text-center border border-border">
            <Smartphone className="h-6 w-6 text-purple-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Digital Access</p>
          </div>
          <div className="bg-card rounded-xl p-4 text-center border border-border">
            <Users className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Free Programs</p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((num) => (
            <div key={num} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step >= num ? "bg-primary-600 text-white" : "bg-muted text-muted-foreground"}`}
              >
                {step > num ? <CheckCircle className="h-5 w-5" /> : num}
              </div>
              {num < 3 && (
                <div className={`w-16 h-1 mx-1 ${step > num ? "bg-primary-600" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 mb-8 text-sm">
          <span className={step >= 1 ? "text-primary-600 font-medium" : "text-muted-foreground"}>Personal Info</span>
          <span className={step >= 2 ? "text-primary-600 font-medium" : "text-muted-foreground"}>Address</span>
          <span className={step >= 3 ? "text-primary-600 font-medium" : "text-muted-foreground"}>Contact & Confirm</span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-sm border border-border p-6 md:p-8">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700">{submitError}</p>
            </div>
          )}

          {/* Step 1: Personal Information */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <User className="h-5 w-5 text-primary-600" />
                Personal Information
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first-name" className="block text-sm font-medium text-foreground/80 mb-1">
                    First Name *
                  </label>
                  <input id="first-name"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                      ${errors.firstName ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.firstName}
                    aria-describedby={errors.firstName ? "firstName-error" : undefined}
                  />
                  {errors.firstName && <p id="firstName-error" role="alert" className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="middle-name" className="block text-sm font-medium text-foreground/80 mb-1">
                    Middle Name
                  </label>
                  <input id="middle-name"
                    type="text"
                    value={formData.middleName}
                    onChange={(e) => updateField("middleName", e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="last-name" className="block text-sm font-medium text-foreground/80 mb-1">
                  Last Name *
                </label>
                <input id="last-name"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                    ${errors.lastName ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.lastName}
                    aria-describedby={errors.lastName ? "lastName-error" : undefined}
                />
                {errors.lastName && <p id="lastName-error" role="alert" className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
              </div>

              <div>
                <label htmlFor="date-of-birth" className="block text-sm font-medium text-foreground/80 mb-1">
                  Date of Birth *
                </label>
                <input id="date-of-birth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => updateField("dateOfBirth", e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                    ${errors.dateOfBirth ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.dateOfBirth}
                    aria-describedby={errors.dateOfBirth ? "dateOfBirth-error" : undefined}
                />
                {errors.dateOfBirth && <p id="dateOfBirth-error" role="alert" className="mt-1 text-sm text-red-600">{errors.dateOfBirth}</p>}
              </div>

              <div>
                <label htmlFor="card-type" className="block text-sm font-medium text-foreground/80 mb-2">
                  Card Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "adult", label: "Adult", desc: "18 years or older" },
                    { value: "juvenile", label: "Juvenile", desc: "Under 18" },
                    { value: "educator", label: "Educator", desc: "Teachers & librarians" },
                  ].map((type) => (
                    <button type="button"
                      key={type.value}
                       onClick={() => updateField("cardType", type.value)}
                      className={`p-3 border rounded-lg text-left transition-colors
                        ${formData.cardType === type.value 
                          ? "border-primary-500 bg-primary-50" 
                          : "border-border hover:border-border"}`}
                    >
                      <p className="font-medium text-foreground">{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Address */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary-600" />
                Address
              </h2>

              <div>
                <label htmlFor="street-address" className="block text-sm font-medium text-foreground/80 mb-1">
                  Street Address *
                </label>
                <input id="street-address"
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => updateField("streetAddress", e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                    ${errors.streetAddress ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.streetAddress}
                    aria-describedby={errors.streetAddress ? "streetAddress-error" : undefined}
                />
                {errors.streetAddress && <p id="streetAddress-error" role="alert" className="mt-1 text-sm text-red-600">{errors.streetAddress}</p>}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label htmlFor="city" className="block text-sm font-medium text-foreground/80 mb-1">
                    City *
                  </label>
                  <input id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                      ${errors.city ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.city}
                    aria-describedby={errors.city ? "city-error" : undefined}
                  />
                  {errors.city && <p id="city-error" role="alert" className="mt-1 text-sm text-red-600">{errors.city}</p>}
                </div>
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-foreground/80 mb-1">
                    State *
                  </label>
                  <input id="state"
                    type="text"
                    value={formData.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    maxLength={2}
                    placeholder="CA"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                      ${errors.state ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.state}
                    aria-describedby={errors.state ? "state-error" : undefined}
                  />
                  {errors.state && <p id="state-error" role="alert" className="mt-1 text-sm text-red-600">{errors.state}</p>}
                </div>
                <div>
                  <label htmlFor="zip-code" className="block text-sm font-medium text-foreground/80 mb-1">
                    ZIP Code *
                  </label>
                  <input id="zip-code"
                    type="text"
                    value={formData.zipCode}
                    onChange={(e) => updateField("zipCode", e.target.value)}
                    maxLength={10}
                    placeholder="12345"
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                      ${errors.zipCode ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.zipCode}
                    aria-describedby={errors.zipCode ? "zipCode-error" : undefined}
                  />
                  {errors.zipCode && <p id="zipCode-error" role="alert" className="mt-1 text-sm text-red-600">{errors.zipCode}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Contact & Confirmation */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary-600" />
                Contact Information
              </h2>

              <div>
                <label htmlFor="email-address" className="block text-sm font-medium text-foreground/80 mb-1">
                  Email Address *
                </label>
                <input id="email-address"
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                    ${errors.email ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="phone-number" className="block text-sm font-medium text-foreground/80 mb-1">
                  Phone Number
                </label>
                <input id="phone-number"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label htmlFor="preferred-branch" className="block text-sm font-medium text-foreground/80 mb-1">
                  Preferred Branch *
                </label>
                <select id="preferred-branch"
                  value={formData.preferredBranch}
                  onChange={(e) => updateField("preferredBranch", e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                    ${errors.preferredBranch ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.preferredBranch}
                    aria-describedby={errors.preferredBranch ? "preferredBranch-error" : undefined}
                >
                  <option value="">Select a branch</option>
                  {(library?.locations || []).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                  {(!library?.locations || library.locations.length === 0) && (
                    <option value="main">Main Library</option>
                  )}
                </select>
                {errors.preferredBranch && <p id="preferredBranch-error" role="alert" className="mt-1 text-sm text-red-600">{errors.preferredBranch}</p>}
              </div>

              {formData.cardType === "juvenile" && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h3 className="font-medium text-amber-900 mb-3">Parent/Guardian Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="parent-guardian-name" className="block text-sm font-medium text-foreground/80 mb-1">
                        Parent/Guardian Name *
                      </label>
                      <input id="parent-guardian-name"
                        type="text"
                        value={formData.parentName || ""}
                        onChange={(e) => updateField("parentName", e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                          ${errors.parentName ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.parentName}
                    aria-describedby={errors.parentName ? "parentName-error" : undefined}
                      />
                      {errors.parentName && <p id="parentName-error" role="alert" className="mt-1 text-sm text-red-600">{errors.parentName}</p>}
                    </div>
                    <div>
                      <label htmlFor="parent-guardian-phone" className="block text-sm font-medium text-foreground/80 mb-1">
                        Parent/Guardian Phone *
                      </label>
                      <input id="parent-guardian-phone"
                        type="tel"
                        value={formData.parentPhone || ""}
                        onChange={(e) => updateField("parentPhone", e.target.value)}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500
                          ${errors.parentPhone ? "border-red-500" : "border-border"}`}
                    aria-invalid={!!errors.parentPhone}
                    aria-describedby={errors.parentPhone ? "parentPhone-error" : undefined}
                      />
                      {errors.parentPhone && <p id="parentPhone-error" role="alert" className="mt-1 text-sm text-red-600">{errors.parentPhone}</p>}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label htmlFor="library-card-terms-of-use" className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.agreeToTerms}
                    onChange={(e) => updateField("agreeToTerms", e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-foreground/80">
                    I agree to the{" "}
                    <Link href="/opac/terms" className="text-primary-600 hover:underline">
                      Library Card Terms of Use
                    </Link>{" "}
                    and understand that I am responsible for all items checked out on my card. *
                  </span>
                </label>
                {errors.agreeToTerms && <p className="text-sm text-red-600">{errors.agreeToTerms}</p>}

                <label htmlFor="email-opt-in" className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={formData.emailOptIn}
                    onChange={(e) => updateField("emailOptIn", e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-foreground/80">
                    Yes, send me email updates about library programs and services
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 flex justify-between gap-4">
            {step > 1 ? (
              <button type="button"
                onClick={handleBack}
                className="px-6 py-2 border border-border text-foreground/80 rounded-lg font-medium
                         hover:bg-muted/30 transition-colors"
              >
                Back
              </button>
            ) : (
              <Link
                href="/opac"
                className="px-6 py-2 border border-border text-foreground/80 rounded-lg font-medium
                         hover:bg-muted/30 transition-colors text-center"
              >
                Cancel
              </Link>
            )}

            {step < 3 ? (
              <button type="button"
                onClick={handleNext}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium
                         hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium
                         hover:bg-primary-700 transition-colors flex items-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Complete Registration
                  </>
                )}
              </button>
            )}
          </div>
        </form>

        {/* Already have a card */}
        <p className="text-center text-muted-foreground mt-6">
          Already have a library card?{" "}
          <Link href="/opac/login" className="text-primary-600 hover:underline font-medium">
            Log in to your account
          </Link>
        </p>
      </div>
    </div>
  );
}
